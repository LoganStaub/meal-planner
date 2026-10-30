// Meal plan: /api/users/:userId/calendar
//
// TODO: there is no login yet. Supabase Auth used to make sure users only
// saw their own calendar; until we add our own login, anyone who knows a
// user_id can read and change that user's meal plan.
import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// 'YYYY-MM-DD' and a real day, so '2026-02-30' is rejected here instead of
// reaching Postgres as an unhandled error
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// meal_slot: 1 = breakfast, 2 = lunch, 3 = dinner (number 2 or string "2")
function isValidSlot(value) {
  return (typeof value === 'number' || typeof value === 'string') && /^[1-3]$/.test(String(value))
}

// GET /api/users/:userId/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/:userId/calendar', async (req, res) => {
  const { start, end } = req.query
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query parameters are required' })
  }

  const { rows } = await pool.query(
    `select c.date, c.meal_slot, r.recipe_id, r.recipe_title
     from calendar c
     join recipes r on r.recipe_id = c.recipe_id
     where c.user_id = $1 and c.date between $2 and $3
     order by c.date, c.meal_slot`,
    [req.params.userId, start, end]
  )
  res.json(rows)
})

// POST /api/users/:userId/calendar  { date, meal_slot, recipe_id }  -> the saved row
// Puts a recipe in a slot, replacing whatever was planned there before.
router.post('/:userId/calendar', async (req, res) => {
  const { date, meal_slot, recipe_id } = req.body ?? {}
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'date must be a real date in YYYY-MM-DD format' })
  }
  if (!isValidSlot(meal_slot)) {
    return res.status(400).json({ error: 'meal_slot must be 1 (breakfast), 2 (lunch), or 3 (dinner)' })
  }
  if (recipe_id === undefined || recipe_id === null || recipe_id === '') {
    return res.status(400).json({ error: 'recipe_id is required' })
  }

  const { rows } = await pool.query(
    `insert into calendar (user_id, date, meal_slot, recipe_id)
     values ($1, $2, $3, $4)
     on conflict (user_id, date, meal_slot) do update set recipe_id = excluded.recipe_id
     returning *`,
    [req.params.userId, date, Number(meal_slot), recipe_id]
  )
  res.json(rows[0])
})

// DELETE /api/users/:userId/calendar/:date/:mealSlot
router.delete('/:userId/calendar/:date/:mealSlot', async (req, res) => {
  const { date, mealSlot } = req.params
  if (!isValidDate(date)) {
    return res.status(400).json({ error: 'date must be a real date in YYYY-MM-DD format' })
  }
  if (!isValidSlot(mealSlot)) {
    return res.status(400).json({ error: 'meal slot must be 1 (breakfast), 2 (lunch), or 3 (dinner)' })
  }

  const { rowCount } = await pool.query(
    'delete from calendar where user_id = $1 and date = $2 and meal_slot = $3',
    [req.params.userId, date, Number(mealSlot)]
  )
  if (rowCount === 0) {
    return res.status(404).json({ error: 'No meal planned in that slot' })
  }
  res.status(204).end()
})

export default router
