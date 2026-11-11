// Login, signup, password reset/change and logout.
// Logged-in state lives in req.session.userId.
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { createHash, randomBytes } from 'node:crypto'
import { pool } from '../db.js'
import { redis, SESSION_PREFIX, userSessionsKey } from '../redis.js'
import { sendPasswordResetEmail } from '../email.js'

const router = Router()

const SALT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8
// bcrypt ignores everything after the first 72 bytes, so longer passwords
// would be silently cut short. Reject them instead.
const MAX_PASSWORD_BYTES = 72
const RESET_LINK_MINUTES = 60
// A new reset email can be requested at most once per minute per account
const RESEND_COOLDOWN_SECONDS = 60

// Compared against when there's no account, so a wrong email takes as long
// as a wrong password and the response time doesn't reveal which emails exist.
const DUMMY_HASH = await bcrypt.hash(randomBytes(16).toString('hex'), SALT_ROUNDS)

// Returns an error message, or undefined if the new password is fine.
function passwordError(password, confirmPassword) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return `Password must be at most ${MAX_PASSWORD_BYTES} characters.`
  if (password !== confirmPassword) return 'Passwords do not match.'
}

// Where to send someone after they log in. Only paths on this site are
// allowed, so a link like /login?next=https://evil.example can't send people
// to another site. Rejects //host and /\host (browsers treat those as other
// sites) and whitespace (browsers strip tabs/newlines, turning /\t/host into //host).
function safeNext(value) {
  return typeof value === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : '/home'
}

// ---------- Rate limits ----------
// Counted per IP address and kept in memory, so they reset when the server
// restarts. When a limit is hit, the same page is shown again with an error.

function formLimiter({ view, minutes, limit, message, onlyFailures = false }) {
  return rateLimit({
    windowMs: minutes * 60 * 1000,
    limit,
    // Login and password change only count wrong passwords (4xx responses)
    skipSuccessfulRequests: onlyFailures,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      const email = (req.body?.email || '').trim().toLowerCase()
      const values = { ...req.body, email }
      delete values.password
      delete values.confirm_password
      delete values.current_password
      res.status(429).render(view, { error: message, values, email, next: req.body?.next })
    },
  })
}

const loginLimiter = formLimiter({
  view: 'login', minutes: 15, limit: 10, onlyFailures: true,
  message: 'Too many failed login attempts. Wait 15 minutes and try again, or reset your password.',
})
const signupLimiter = formLimiter({
  view: 'signup', minutes: 60, limit: 10,
  message: 'Too many signups from this network. Try again in an hour.',
})
const forgotLimiter = formLimiter({
  view: 'forgot-password', minutes: 15, limit: 5,
  message: 'Too many reset emails requested. Wait 15 minutes and try again.',
})
const changePasswordLimiter = formLimiter({
  view: 'change-password', minutes: 15, limit: 10, onlyFailures: true,
  message: 'Too many wrong passwords. Wait 15 minutes and try again.',
})

// Runs on every request. Looks up the logged-in user from the session and
// makes them available as req.user (for routes) and currentUser (for EJS).
// The user is read from the database each time, so a changed name or role
// takes effect right away instead of when the session ends.
export async function loadUser(req, res, next) {
  res.locals.currentUser = null
  const userId = req.session.userId
  if (!userId) return next()

  const { rows } = await pool.query(
    'select user_id, first_name, last_name, email, role from users where user_id = $1',
    [userId]
  )
  const user = rows[0]

  // The account was deleted while they were logged in: end the session.
  if (!user) {
    return req.session.destroy((err) => next(err))
  }

  const first = user.first_name?.trim() || ''
  const last = user.last_name?.trim() || ''
  user.display_name = [first, last].filter(Boolean).join(' ') || user.email
  user.initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || user.email[0].toUpperCase()
  user.is_admin = user.role === 'admin'

  req.user = user
  res.locals.currentUser = user
  next()
}

function deny(req, res, status, message) {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({ error: message })
  }
  if (status === 401) {
    // Come back to this page after logging in
    const next = req.method === 'GET' ? req.originalUrl : undefined
    return res.redirect(next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }
  res.status(status).send(message)
}

// Middleware for pages and API routes that need a logged-in user.
// Pages redirect to /login; API calls get a 401 JSON error instead.
export function requireLogin(req, res, next) {
  if (req.user) return next()
  deny(req, res, 401, 'Log in to continue')
}

// Middleware for routes that change the shared recipe and ingredient lists.
export function requireAdmin(req, res, next) {
  if (!req.user) return deny(req, res, 401, 'Log in to continue')
  if (req.user.is_admin) return next()
  deny(req, res, 403, 'Only admins can do that')
}

// How long the user_sessions:<userId> list is kept (matches the 7-day cookie
// in server.js). Each login resets it.
const SESSION_LIST_SECONDS = 60 * 60 * 24 * 7

// Store the user in a fresh session. Regenerating the session id on login
// stops an attacker from planting a session id before the user logs in.
// The session id is also added to the user's list in Redis, so
// endSessions can find all of their logins.
async function startSession(req, user) {
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err)
      req.session.userId = user.user_id
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()))
    })
  })
  const key = userSessionsKey(user.user_id)
  await redis.multi().sAdd(key, req.sessionID).expire(key, SESSION_LIST_SECONDS).exec()
}

// Logged-in users don't need the login or signup forms.
function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect(safeNext(req.query.next))
  next()
}

router.get(['/login', '/login.html'], redirectIfLoggedIn, (req, res) => {
  const next = safeNext(req.query.next)
  res.render('login', { next: next === '/home' ? undefined : next })
})

router.get(['/signup', '/signup.html'], redirectIfLoggedIn, (req, res) => {
  res.render('signup')
})

// Links in password reset emails carry a random token; only its hash is stored.
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function newToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashToken(token) }
}

// Base URL for links in emails. Set APP_URL in production (e.g.
// https://mealplanner.example.com). It isn't taken from the request's Host
// header, which a visitor could fake to send people to another site.
function appUrl() {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '')
}


// ---------- Login and signup ----------

router.post('/login', loginLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const password = req.body.password || ''
  const next = req.body.next

  const { rows } = await pool.query(
    'select user_id, password_hash from users where lower(email) = $1',
    [email]
  )
  const user = rows[0]

  // Exactly one bcrypt compare runs on every path (against the dummy hash
  // when there's nothing real to check), so all failures take the same time.
  const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH)
  if (matches && user?.password_hash) {
    await startSession(req, user)
    return res.redirect(safeNext(next))
  }

  // Same message whether the email or the password is wrong, so the form
  // doesn't reveal which emails have accounts.
  res.status(401).render('login', {
    error: 'Wrong email or password.',
    values: { email },
    next,
  })
})

// POST /signup  creates the account right away and logs the user in.
router.post('/signup', signupLimiter, async (req, res) => {
  const values = {
    first_name: (req.body.first_name || '').trim(),
    last_name: (req.body.last_name || '').trim(),
    email: (req.body.email || '').trim().toLowerCase(),
    phone: (req.body.phone || '').trim(),
  }
  const password = req.body.password || ''
  const confirmPassword = req.body.confirm_password || ''

  let error
  if (!values.first_name || !values.last_name) error = 'Enter your first and last name.'
  else if (!/^\S+@\S+\.\S+$/.test(values.email)) error = 'Enter a valid email address.'
  else error = passwordError(password, confirmPassword)

  if (error) return res.status(400).render('signup', { error, values })

  const existing = await pool.query('select 1 from users where lower(email) = $1', [values.email])
  if (existing.rows.length > 0) {
    return res.status(409).render('signup', {
      error: 'An account with that email already exists. Try logging in.',
      values,
    })
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  let user
  try {
    const { rows } = await pool.query(
      `insert into users (first_name, last_name, email, password_hash, phone)
       values ($1, $2, $3, $4, $5)
       returning user_id`,
      [values.first_name, values.last_name, values.email, passwordHash, values.phone || null]
    )
    user = rows[0]
  } catch (err) {
    // 23505: unique violation, an account with this email already exists
    if (err.code === '23505') {
      return res.status(409).render('signup', {
        error: 'An account with that email already exists. Try logging in.',
        values,
      })
    }
    throw err
  }

  await startSession(req, user)
  res.redirect('/home')
})

// ---------- Forgot / reset password ----------
//
// "Forgot password?" emails a one-time link that expires in RESET_LINK_MINUTES.
// Opening the link only shows a form; the password changes when that form
// is submitted.

// Ends every saved login for a user, except keepSid (the session making
// the change). Someone who stole the old password gets logged out.
// The list can hold ids of sessions that already expired; deleting those is harmless.
async function endSessions(userId, keepSid = null) {
  const key = userSessionsKey(userId)
  const sids = (await redis.sMembers(key)).filter((sid) => sid !== keepSid)
  if (sids.length === 0) return
  await redis
    .multi()
    .del(sids.map((sid) => SESSION_PREFIX + sid))
    .sRem(key, sids)
    .exec()
}

// Reset links live in Redis, which deletes them by itself when they expire:
//   reset:<tokenHash>        -> user id. Only a hash of the emailed token is
//                               stored, so reading Redis doesn't give working links.
//   reset_user:<userId>      -> that user's current tokenHash, so only the
//                               newest link works and a link can be cancelled.
//   reset_cooldown:<userId>  -> exists for RESEND_COOLDOWN_SECONDS after a link is sent.
const resetKey = (tokenHash) => `reset:${tokenHash}`
const resetUserKey = (userId) => `reset_user:${userId}`
const resetCooldownKey = (userId) => `reset_cooldown:${userId}`

// The user id a still-valid reset link belongs to, or null
async function findResetToken(token) {
  if (!token || typeof token !== 'string') return null
  return redis.get(resetKey(hashToken(token)))
}

// Cancels the user's reset link, if they have one
async function cancelResetLink(userId) {
  const tokenHash = await redis.getDel(resetUserKey(userId))
  if (tokenHash) await redis.del(resetKey(tokenHash))
}

router.get('/forgot-password', redirectIfLoggedIn, (req, res) => {
  res.render('forgot-password')
})

// POST /forgot-password  { email }
// Always shows the same "check your email" message, so it doesn't reveal
// which emails have accounts.
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).render('forgot-password', { error: 'Enter a valid email address.', values: { email } })
  }

  const { rows } = await pool.query(
    'select user_id, email, first_name from users where lower(email) = $1 and password_hash is not null',
    [email]
  )
  const account = rows[0]

  // NX: only set if missing, so this is false while the cooldown is running
  const allowed = account &&
    (await redis.set(resetCooldownKey(account.user_id), '1', { NX: true, EX: RESEND_COOLDOWN_SECONDS }))

  if (allowed) {
    // Only the newest link works
    await cancelResetLink(account.user_id)
    const { token, tokenHash } = newToken()
    const ttl = RESET_LINK_MINUTES * 60
    await redis
      .multi()
      .set(resetKey(tokenHash), String(account.user_id), { EX: ttl })
      .set(resetUserKey(account.user_id), tokenHash, { EX: ttl })
      .exec()

    // Not awaited: waiting for the mail server would make this response
    // slower for real accounts, which would reveal that they exist.
    sendPasswordResetEmail({
      to: account.email,
      firstName: account.first_name,
      link: `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`,
    }).catch((error) => console.error('Could not send password reset email:', error))
  }

  res.render('forgot-password', { sent: true, email })
})

// GET /reset-password?token=...  shows the new-password form
router.get('/reset-password', async (req, res) => {
  const token = req.query.token
  if (!(await findResetToken(token))) return res.status(400).render('reset-password', { invalid: true })
  res.render('reset-password', { token })
})

// POST /reset-password  { token, password, confirm_password }
// Sets the new password, logs out every other device, and logs this one in.
router.post('/reset-password', async (req, res) => {
  const token = req.body.token
  const password = req.body.password || ''
  const confirmPassword = req.body.confirm_password || ''

  if (!(await findResetToken(token))) return res.status(400).render('reset-password', { invalid: true })

  const error = passwordError(password, confirmPassword)
  if (error) return res.status(400).render('reset-password', { token, error })

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  // GETDEL reads and deletes in one step, so a link works only once,
  // even if the form is submitted twice at the same moment.
  const userId = await redis.getDel(resetKey(hashToken(token)))
  if (!userId) return res.status(400).render('reset-password', { invalid: true })
  await redis.del(resetUserKey(userId))

  const user = { user_id: Number(userId) }
  await pool.query('update users set password_hash = $2 where user_id = $1', [user.user_id, passwordHash])
  await endSessions(user.user_id)
  await startSession(req, user)
  res.redirect('/home')
})


// ---------- Change password (logged in) ----------

router.get('/account/password', requireLogin, (req, res) => {
  res.render('change-password')
})

// POST /account/password  { current_password, password, confirm_password }
router.post('/account/password', requireLogin, changePasswordLimiter, async (req, res) => {
  const currentPassword = req.body.current_password || ''
  const password = req.body.password || ''
  const confirmPassword = req.body.confirm_password || ''
  const userId = req.user.user_id

  const { rows } = await pool.query('select password_hash from users where user_id = $1', [userId])
  const currentHash = rows[0]?.password_hash
  const matches = await bcrypt.compare(currentPassword, currentHash || DUMMY_HASH)
  if (!matches || !currentHash) {
    return res.status(400).render('change-password', { error: 'Your current password is wrong.' })
  }

  let error = passwordError(password, confirmPassword)
  if (!error && password === currentPassword) error = 'Choose a password different from your current one.'
  if (error) return res.status(400).render('change-password', { error })

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  await pool.query('update users set password_hash = $2 where user_id = $1', [userId, passwordHash])
  // An old reset link shouldn't be able to undo this change
  await cancelResetLink(userId)
  await endSessions(userId, req.sessionID)

  res.render('change-password', {
    notice: 'Password changed. Any other devices that were logged in have been logged out.',
  })
})

router.post('/logout', async (req, res, next) => {
  if (req.user) await redis.sRem(userSessionsKey(req.user.user_id), req.sessionID)
  req.session.destroy((err) => {
    if (err) return next(err)
    res.clearCookie('sid')
    res.redirect('/login')
  })
})

export default router
