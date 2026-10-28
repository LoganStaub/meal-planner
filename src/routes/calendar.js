// Meal plan: /api/users/:userId/calendar
//
// TODO: there is no login yet. Supabase Auth used to make sure users only
// saw their own calendar; until we add our own login, anyone who knows a
// user_id can read that user's meal plan.
import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

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

export default router
