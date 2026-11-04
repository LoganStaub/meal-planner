// Meal plan: /api/users/:userId/calendar
//
// TODO: there is no login yet. Supabase Auth used to make sure users only
// saw their own calendar; until we add our own login, anyone who knows a
// user_id can read that user's meal plan.
import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30)
function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isPositiveInt(value) {
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 2147483647
}

// GET /api/users/:userId/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// -> [{ date: 'YYYY-MM-DD', meal_slot, recipe_id, recipe_title }, ...]
router.get('/:userId/calendar', async (req, res) => {
  const { userId } = req.params
  const { start, end } = req.query
  if (!isPositiveInt(userId)) {
    return res.status(400).json({ error: 'userId must be a positive integer' })
  }
  if (!isDateKey(start) || !isDateKey(end)) {
    return res.status(400).json({ error: 'start and end must be dates in YYYY-MM-DD format' })
  }
  if (start > end) {
    return res.status(400).json({ error: 'start must be on or before end' })
  }

  // to_char keeps the date as 'YYYY-MM-DD', which the page matches on exactly
  const { rows } = await pool.query(
    `select to_char(c.date, 'YYYY-MM-DD') as date, c.meal_slot, r.recipe_id, r.recipe_title
     from calendar c
     join recipes r on r.recipe_id = c.recipe_id
     where c.user_id = $1 and c.date between $2::date and $3::date
     order by c.date, c.meal_slot`,
    [userId, start, end]
  )
  res.json(rows)
})

// DELETE /api/users/:userId/calendar/:date/:slot  -> 204, or 404 if nothing was planned there
router.delete('/:userId/calendar/:date/:slot', async (req, res) => {
  const { userId, date, slot } = req.params
  if (!isPositiveInt(userId) || !isDateKey(date) || !isPositiveInt(slot)) {
    return res.status(400).json({ error: 'Expected /api/users/:userId/calendar/YYYY-MM-DD/:slot' })
  }

  const { rowCount } = await pool.query(
    `delete from calendar
     where user_id = $1 and date = $2::date and meal_slot = $3`,
    [userId, date, slot]
  )
  if (rowCount === 0) {
    return res.status(404).json({ error: 'No meal planned for that day and slot' })
  }
  res.status(204).end()
})

export default router
