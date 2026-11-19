// Admin API for "Maintain Users": /api/admin/users
// Every route needs an admin (requireAdmin), so regular users get a 403 even
// if they find the URL. Passwords are never sent back to the browser.
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { requireAdmin, passwordError, SALT_ROUNDS, endSessions } from './auth.js'

const router = Router()
router.use(requireAdmin)

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

// The columns the admin page may see (never password_hash)
const USER_FIELDS = `user_id, first_name, last_name, email, phone, (role = 'admin') as is_admin`

const isId = (value) => /^\d{1,9}$/.test(String(value))
const text = (value) => (typeof value === 'string' ? value.trim() : '')

// GET /api/admin/users  -> every user, sorted by email
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`select ${USER_FIELDS} from users order by lower(email)`)
  res.json(rows)
})

// POST /api/admin/users  { first_name, last_name, email, password, phone?, is_admin? }
router.post('/', async (req, res) => {
  const first = text(req.body.first_name)
  const last = text(req.body.last_name)
  const email = text(req.body.email).toLowerCase()
  const phone = text(req.body.phone)
  const password = typeof req.body.password === 'string' ? req.body.password : ''

  if (!first || !last) return res.status(400).json({ error: 'Enter a first and last name.' })
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
  // Same password rules as signup (the password is checked against itself
  // because the admin form has no confirm box)
  const problem = passwordError(password, password)
  if (problem) return res.status(400).json({ error: problem })

  // Column names come from this fixed list, never from the request
  const columns = ['first_name', 'last_name', 'email', 'password_hash', 'phone']
  const values = [first, last, email, await bcrypt.hash(password, SALT_ROUNDS), phone || null]
  if (req.body.is_admin === true) {
    columns.push('role')
    values.push('admin')
  }

  try {
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ')
    const { rows } = await pool.query(
      `insert into users (${columns.join(', ')}) values (${placeholders}) returning ${USER_FIELDS}`,
      values
    )
    res.status(201).json(rows[0])
  } catch (err) {
    // 23505: unique violation, that email already has an account
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' })
    throw err
  }
})

// PATCH /api/admin/users/:id  any of { first_name, last_name, email, phone, is_admin, password }
// Only the fields that are sent change. A blank password means "keep it".
router.patch('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Bad user id.' })
  const id = Number(req.params.id)
  const body = req.body
  const sets = []
  const values = []
  const add = (column, value) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if ('first_name' in body) {
    if (!text(body.first_name)) return res.status(400).json({ error: 'First name cannot be empty.' })
    add('first_name', text(body.first_name))
  }
  if ('last_name' in body) {
    if (!text(body.last_name)) return res.status(400).json({ error: 'Last name cannot be empty.' })
    add('last_name', text(body.last_name))
  }
  if ('email' in body) {
    const email = text(body.email).toLowerCase()
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' })
    add('email', email)
  }
  if ('phone' in body) add('phone', text(body.phone) || null)

  if ('is_admin' in body) {
    // Stops an admin from locking themselves (and possibly everyone) out
    if (id === req.user.user_id && body.is_admin !== true) {
      return res.status(400).json({ error: "You can't remove your own admin access." })
    }
    // "default" puts back the normal (non-admin) role the table uses
    sets.push(body.is_admin === true ? `role = 'admin'` : 'role = default')
  }

  const password = typeof body.password === 'string' ? body.password : ''
  const changingPassword = password !== ''
  if (changingPassword) {
    const problem = passwordError(password, password)
    if (problem) return res.status(400).json({ error: problem })
    add('password_hash', await bcrypt.hash(password, SALT_ROUNDS))
  }

  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  try {
    const { rows } = await pool.query(
      `update users set ${sets.join(', ')} where user_id = $${values.length + 1} returning ${USER_FIELDS}`,
      [...values, id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' })

    // A new password logs the user out everywhere (but not the admin editing themselves)
    if (changingPassword) await endSessions(id, id === req.user.user_id ? req.sessionID : null)
    res.json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' })
    throw err
  }
})

// DELETE /api/admin/users/:id
// Their calendar, pantry, likes and ratings are removed with them (the
// database cascades). Recipes they added stay, with no author.
router.delete('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Bad user id.' })
  const id = Number(req.params.id)
  if (id === req.user.user_id) {
    return res.status(400).json({ error: "You can't delete your own account here." })
  }

  const { rowCount } = await pool.query('delete from users where user_id = $1', [id])
  if (rowCount === 0) return res.status(404).json({ error: 'User not found.' })

  // Log out anyone still signed in as that user
  await endSessions(id)
  res.status(204).end()
})

export default router