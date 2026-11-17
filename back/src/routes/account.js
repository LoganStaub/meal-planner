// The logged-in user's account details: /api/me/account
// Used by the "Account settings" popup (partials/profile-menu, js/profile-menu.js).
//
//   GET    /api/me/account   the account's details
//   PATCH  /api/me/account   change some details. Send only the fields to change.
//                            avatar_color must be one of src/avatarColors.js.
//                            phone / profile_pic set to "" or null are removed.
//                            Changing the email also needs current_password.
//   DELETE /api/me/account   { password, confirm: "DELETE" }  deletes the account
//                            and everything that belongs to it (calendar, likes,
//                            pantry: their foreign keys cascade), then logs out
//                            every device.
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { pool } from '../db.js'
import { redis, userSessionsKey } from '../redis.js'
import { DUMMY_HASH, cancelResetLink, endSessions } from './auth.js'
import { isAvatarColor } from '../avatarColors.js'

const router = Router()

const DELETE_WORD = 'DELETE'
const MAX_NAME = 100
const MAX_EMAIL = 254
const MAX_URL = 2048

// Only wrong passwords count, like the login form.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({ error: 'Too many wrong passwords. Wait 15 minutes and try again.' })
  },
})

const selectAccount = 'select first_name, last_name, email, phone, profile_pic, avatar_color from users where user_id = $1'

async function getAccount(userId) {
  const { rows } = await pool.query(selectAccount, [userId])
  return rows[0]
}

async function passwordMatches(userId, password) {
  const { rows } = await pool.query('select password_hash from users where user_id = $1', [userId])
  const hash = rows[0]?.password_hash
  const matches = await bcrypt.compare(typeof password === 'string' ? password : '', hash || DUMMY_HASH)
  return matches && Boolean(hash)
}

const text = (value) => (typeof value === 'string' ? value.trim() : value == null ? '' : null)

// Checks the fields that were sent. Returns { error } or { changes } where
// changes maps column -> new value (null removes an optional field).
function readChanges(body) {
  const changes = {}

  for (const [field, label] of [['first_name', 'First name'], ['last_name', 'Last name']]) {
    if (!(field in body)) continue
    const value = text(body[field])
    if (!value) return { error: `${label} can't be empty.` }
    if (value.length > MAX_NAME) return { error: `${label} must be at most ${MAX_NAME} characters.` }
    changes[field] = value
  }

  if ('email' in body) {
    const value = text(body.email)?.toLowerCase()
    if (!value || value.length > MAX_EMAIL || !/^\S+@\S+\.\S+$/.test(value)) {
      return { error: 'Enter a valid email address.' }
    }
    changes.email = value
  }

  if ('phone' in body) {
    const value = text(body.phone)
    if (value === null) return { error: 'Enter a valid phone number.' }
    if (value && !/^\+?[\d\s().-]{7,25}$/.test(value)) return { error: 'Enter a valid phone number.' }
    changes.phone = value || null
  }

  if ('profile_pic' in body) {
    const value = text(body.profile_pic)
    if (value === null) return { error: 'Enter a valid image URL.' }
    if (value) {
      let url
      try { url = new URL(value) } catch { /* handled below */ }
      if (!url || !['http:', 'https:'].includes(url.protocol) || value.length > MAX_URL) {
        return { error: 'Profile picture must be an http(s) image URL.' }
      }
    }
    changes.profile_pic = value || null
  }

  if ('avatar_color' in body) {
    const value = text(body.avatar_color)?.toLowerCase()
    if (!isAvatarColor(value)) return { error: 'Pick one of the listed colors.' }
    changes.avatar_color = value
  }

  return { changes }
}

router.get('/', async (req, res) => {
  res.json(await getAccount(req.user.user_id))
})

router.patch('/', passwordLimiter, async (req, res) => {
  const userId = req.user.user_id
  const { error, changes } = readChanges(req.body || {})
  if (error) return res.status(400).json({ error })

  // Drop fields that didn't actually change
  const current = await getAccount(userId)
  for (const field of Object.keys(changes)) {
    if ((current[field] ?? null) === changes[field]) delete changes[field]
  }
  if (Object.keys(changes).length === 0) return res.json(current)

  // Changing the login email needs the password, so someone using a
  // computer left logged in can't take the account over.
  if (changes.email && !(await passwordMatches(userId, req.body.current_password))) {
    return res.status(400).json({ error: 'Enter your current password to change your email.', field: 'current_password' })
  }

  const columns = Object.keys(changes)
  const sets = columns.map((column, i) => `${column} = $${i + 2}`).join(', ')
  try {
    const { rows } = await pool.query(
      `update users set ${sets} where user_id = $1
       returning first_name, last_name, email, phone, profile_pic, avatar_color`,
      [userId, ...columns.map((column) => changes[column])]
    )
    if (changes.email) await cancelResetLink(userId) // old reset links went to the old address
    res.json(rows[0])
  } catch (err) {
    // 23505: unique violation, the email belongs to another account
    if (err.code === '23505') return res.status(409).json({ error: 'Another account already uses that email.', field: 'email' })
    throw err
  }
})

router.delete('/', passwordLimiter, async (req, res, next) => {
  const userId = req.user.user_id
  const { password, confirm } = req.body || {}

  if (confirm !== DELETE_WORD) {
    return res.status(400).json({ error: `Type ${DELETE_WORD} to confirm.`, field: 'confirm' })
  }
  if (!(await passwordMatches(userId, password))) {
    return res.status(400).json({ error: 'Your password is wrong.', field: 'password' })
  }

  await pool.query('delete from users where user_id = $1', [userId])
  await cancelResetLink(userId)
  await endSessions(userId, req.sessionID)
  await redis.del(userSessionsKey(userId))

  req.session.destroy((err) => {
    if (err) return next(err)
    res.clearCookie('sid')
    res.json({ deleted: true, redirect: '/login' })
  })
})

export default router
