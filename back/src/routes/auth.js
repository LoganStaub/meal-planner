// Login, signup, email verification and logout.
// Logged-in state lives in req.session.userId.
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'node:crypto'
import { pool } from '../db.js'
import { sendVerificationEmail } from '../email.js'

const router = Router()

const SALT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8
const VERIFY_LINK_HOURS = 24
// A new verification email can be requested at most once per minute per account
const RESEND_COOLDOWN_SECONDS = 60

// Runs on every request. Looks up the logged-in user from the session and
// makes them available as req.user (for routes) and currentUser (for EJS).
// The user is read from the database each time, so a changed name or role
// takes effect right away instead of when the session ends.
export async function loadUser(req, res, next) {
  res.locals.currentUser = null
  const userId = req.session.userId
  if (!userId) return next()

  const { rows } = await pool.query(
    `select user_id, first_name, last_name, email, role from users
     where user_id = $1 and email_verified_at is not null`,
    [userId]
  )
  const user = rows[0]

  // The account was deleted (or isn't verified) while they were logged in: end the session.
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
  if (status === 401) return res.redirect('/login')
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

// Store the user in a fresh session. Regenerating the session id on login
// stops an attacker from planting a session id before the user logs in.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err)
      req.session.userId = user.user_id
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()))
    })
  })
}

// Logged-in users don't need the login or signup forms.
function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect('/home')
  next()
}

router.get(['/login', '/login.html'], redirectIfLoggedIn, (req, res) => {
  res.render('login')
})

router.get(['/signup', '/signup.html'], redirectIfLoggedIn, (req, res) => {
  res.render('signup')
})

// ---------- Email verification ----------
//
// Signup doesn't create a user. It saves the form in pending_signups and
// emails a link; the users row is only created when that link is used.

// The link in the email carries a random token; only its hash is stored.
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

// Returns false if the email couldn't be sent.
async function emailLink({ email, firstName, token }) {
  try {
    await sendVerificationEmail({
      to: email,
      firstName,
      link: `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`,
    })
    return true
  } catch (error) {
    console.error('Could not send verification email:', error)
    return false
  }
}

// Expired signups were never verified, so nothing else refers to them.
function deleteExpiredSignups() {
  return pool.query('delete from pending_signups where expires_at <= now()')
}

// The waiting signup a still-valid link belongs to, or undefined
async function findPendingSignup(token) {
  if (!token || typeof token !== 'string') return undefined
  const { rows } = await pool.query(
    'select email from pending_signups where token_hash = $1 and expires_at > now()',
    [hashToken(token)]
  )
  return rows[0]
}

// GET /verify-email?token=...  shows a "Verify my email" button.
// The link doesn't verify on its own: some email apps open every link to
// scan it, which would use up the one-time link before the person clicks it.
router.get('/verify-email', async (req, res) => {
  const token = req.query.token
  const pending = await findPendingSignup(token)
  if (!pending) return res.status(400).render('verify-email', { invalid: true })
  res.render('verify-email', { token, email: pending.email })
})

// POST /verify-email  { token }  creates the account and logs the user in
router.post('/verify-email', async (req, res) => {
  const token = req.body.token
  if (!token || typeof token !== 'string') {
    return res.status(400).render('verify-email', { invalid: true })
  }

  const client = await pool.connect()
  let user
  try {
    await client.query('begin')

    // Deleting the signup and reading it in one statement means a link can
    // only ever be used once, even if it's clicked twice at the same moment.
    const { rows } = await client.query(
      `delete from pending_signups
       where token_hash = $1
       returning first_name, last_name, email, password_hash, phone, expires_at > now() as still_valid`,
      [hashToken(token)]
    )
    const pending = rows[0]
    if (!pending?.still_valid) {
      await client.query('commit') // an expired signup is deleted either way
      return res.status(400).render('verify-email', { invalid: true })
    }

    const created = await client.query(
      `insert into users (first_name, last_name, email, password_hash, phone, email_verified_at)
       values ($1, $2, $3, $4, $5, now())
       returning user_id`,
      [pending.first_name, pending.last_name, pending.email, pending.password_hash, pending.phone]
    )
    user = created.rows[0]
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    // 23505: an account with this email was created after this signup started
    if (err.code === '23505') {
      return res.status(409).render('login', {
        error: 'An account with that email already exists. Log in instead.',
      })
    }
    throw err
  } finally {
    client.release()
  }

  await startSession(req, user)
  res.redirect('/home')
})

// POST /resend-verification  { email }
// Sends a new link (and cancels the old one) for a signup that's still waiting.
// Always shows the same page, so it doesn't reveal which emails have signed up.
router.post('/resend-verification', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  await deleteExpiredSignups()

  const { token, tokenHash } = newToken()
  // Only updates a signup whose last email is more than the cooldown old.
  // The link stays valid for VERIFY_LINK_HOURS from now.
  const { rows } = await pool.query(
    `update pending_signups
     set token_hash = $2, created_at = now(), expires_at = now() + make_interval(hours => $3)
     where lower(email) = $1 and created_at <= now() - make_interval(secs => $4)
     returning email, first_name`,
    [email, tokenHash, VERIFY_LINK_HOURS, RESEND_COOLDOWN_SECONDS]
  )
  const pending = rows[0]
  if (pending) await emailLink({ email: pending.email, firstName: pending.first_name, token })

  res.render('check-email', { email, resent: true })
})


// ---------- Login and signup ----------

router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase()
  const password = req.body.password || ''

  const { rows } = await pool.query(
    'select user_id, password_hash from users where lower(email) = $1',
    [email]
  )
  const user = rows[0]

  if (user?.password_hash && (await bcrypt.compare(password, user.password_hash))) {
    await startSession(req, user)
    return res.redirect('/home')
  }

  // No account yet, but they may have signed up and not clicked the link.
  // Only mentioned when the password matches that signup, so it doesn't
  // reveal anything to someone guessing emails.
  if (!user) {
    const pending = await pool.query(
      'select password_hash from pending_signups where lower(email) = $1 and expires_at > now()',
      [email]
    )
    const pendingHash = pending.rows[0]?.password_hash
    if (pendingHash && (await bcrypt.compare(password, pendingHash))) {
      return res.status(403).render('login', {
        error: 'Verify your email before logging in. Check your inbox for the link we sent.',
        values: { email },
        unverifiedEmail: email,
      })
    }
  }

  // Same message whether the email or the password is wrong, so the form
  // doesn't reveal which emails have accounts.
  res.status(401).render('login', {
    error: 'Wrong email or password.',
    values: { email },
  })
})

router.post('/signup', async (req, res) => {
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
  else if (password.length < MIN_PASSWORD_LENGTH) error = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  else if (password !== confirmPassword) error = 'Passwords do not match.'

  if (error) return res.status(400).render('signup', { error, values })

  const existing = await pool.query('select 1 from users where lower(email) = $1', [values.email])
  if (existing.rows.length > 0) {
    return res.status(409).render('signup', {
      error: 'An account with that email already exists. Try logging in.',
      values,
    })
  }

  await deleteExpiredSignups()
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
  const { token, tokenHash } = newToken()

  // Signing up again with the same email replaces the earlier waiting signup
  // (and its link), so the newest form and password are the ones used.
  await pool.query(
    `insert into pending_signups (token_hash, first_name, last_name, email, password_hash, phone, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + make_interval(hours => $7))
     on conflict ((lower(email))) do update set
       token_hash = excluded.token_hash,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       email = excluded.email,
       password_hash = excluded.password_hash,
       phone = excluded.phone,
       created_at = now(),
       expires_at = excluded.expires_at`,
    [tokenHash, values.first_name, values.last_name, values.email, passwordHash,
      values.phone || null, VERIFY_LINK_HOURS]
  )

  // No account and not logged in yet: both happen when they use the link.
  const sent = await emailLink({ email: values.email, firstName: values.first_name, token })
  res.status(201).render('check-email', { email: values.email, sendFailed: !sent })
})

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err)
    res.clearCookie('sid')
    res.redirect('/login')
  })
})

export default router
