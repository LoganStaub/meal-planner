// The logged-in user's meal plan: /api/me/calendar
// The user always comes from the session (req.user), never from the URL,
// so nobody can read or change someone else's calendar.
import { Router } from 'express'
import { pool } from '../db.js'
import { isDateKey, isPositiveInt } from '../validators.js'

const router = Router()

// GET /api/me/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// -> [{ date: 'YYYY-MM-DD', meal_slot, recipe_id, recipe_title }, ...]
router.get('/', async (req, res) => {
  const { start, end } = req.query
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
    [req.user.user_id, start, end]
  )
  res.json(rows)
})

// DELETE /api/me/calendar/:date/:slot  -> 204, or 404 if nothing was planned there
router.delete('/:date/:slot', async (req, res) => {
  const { date, slot } = req.params
  if (!isDateKey(date) || !isPositiveInt(slot)) {
    return res.status(400).json({ error: 'Expected /api/me/calendar/YYYY-MM-DD/:slot' })
  }

  const { rowCount } = await pool.query(
    `delete from calendar
     where user_id = $1 and date = $2::date and meal_slot = $3`,
    [req.user.user_id, date, slot]
  )
  if (rowCount === 0) {
    return res.status(404).json({ error: 'No meal planned for that day and slot' })
  }
  res.status(204).end()
})

export default router
