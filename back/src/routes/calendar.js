// Meal plan: /api/users/:userId/calendar
//
// TODO: there is no login yet. Supabase Auth used to make sure users only
// saw their own calendar; until we add our own login, anyone who knows a
// user_id can read that user's meal plan.
import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30)
// Also used by the search page to read ?date= from the calendar's + links.
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isPositiveInt(value) {
  return /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 2147483647
}

// meal_slot: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert
// (matches the check constraint in db/schema.sql)
export const MEAL_SLOTS = { 1: 'Breakfast', 2: 'Lunch', 3: 'Dinner', 4: 'Snack', 5: 'Dessert' }

// Accepts 3 or "3"; rejects 6, "3.0", [3], "constructor"…
function isMealSlot(value) {
  return (typeof value === 'number' || typeof value === 'string') &&
    /^\d$/.test(String(value)) && Object.hasOwn(MEAL_SLOTS, String(value))
}

// GET /api/users/:userId/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// -> [{ calendar_id, date: 'YYYY-MM-DD', meal_slot, recipe_id, recipe_title }, ...]
// A meal can have several dishes; they come back in the order they were added.
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
    `select c.calendar_id, to_char(c.date, 'YYYY-MM-DD') as date, c.meal_slot, r.recipe_id, r.recipe_title
     from calendar c
     join recipes r on r.recipe_id = c.recipe_id
     where c.user_id = $1 and c.date between $2::date and $3::date
     order by c.date, c.meal_slot, c.calendar_id`,
    [userId, start, end]
  )
  res.json(rows)
})

// POST /api/users/:userId/calendar  { date: 'YYYY-MM-DD', meal_slot, recipe_id, allow_duplicate? }
// -> 201 with the new row. A meal can have several dishes, so this adds one more.
//
// If the recipe is already planned that day it answers 409 with
// { code: 'already_planned', meal_slots: [3, …] } so the page can ask first:
//   * in another meal (lunch, now dinner): send again with allow_duplicate: true
//   * in this same meal: can't be added twice, even with allow_duplicate
router.post('/:userId/calendar', async (req, res) => {
  const { userId } = req.params
  const { date, meal_slot: mealSlot, recipe_id: recipeId, allow_duplicate: allowDuplicate } = req.body ?? {}
  if (!isPositiveInt(userId)) {
    return res.status(400).json({ error: 'userId must be a positive integer' })
  }
  if (!isDateKey(date) || !isMealSlot(mealSlot) || !isPositiveInt(String(recipeId))) {
    return res.status(400).json({
      error: 'Expected { date: "YYYY-MM-DD", meal_slot: 1-5, recipe_id: positive integer }',
    })
  }

  const { rows: planned } = await pool.query(
    `select meal_slot from calendar
     where user_id = $1 and date = $2::date and recipe_id = $3
     order by meal_slot`,
    [userId, date, recipeId]
  )
  const plannedSlots = planned.map((row) => row.meal_slot)
  const inSameMeal = plannedSlots.includes(Number(mealSlot))
  if (plannedSlots.length > 0 && (allowDuplicate !== true || inSameMeal)) {
    const where = plannedSlots.map((slot) => MEAL_SLOTS[slot].toLowerCase()).join(' and ')
    return res.status(409).json({
      error: `That recipe is already planned for ${where} that day.`,
      code: 'already_planned',
      meal_slots: plannedSlots,
    })
  }

  // A recipe or user that doesn't exist fails the foreign key (400 in server.js).
  // on conflict still guards against two clicks landing at the same moment.
  const { rows } = await pool.query(
    `insert into calendar (user_id, date, meal_slot, recipe_id)
     values ($1, $2::date, $3, $4)
     on conflict (user_id, date, meal_slot, recipe_id) do nothing
     returning calendar_id, to_char(date, 'YYYY-MM-DD') as date, meal_slot, recipe_id`,
    [userId, date, mealSlot, recipeId]
  )
  if (rows.length === 0) {
    return res.status(409).json({
      error: `That recipe is already planned for ${MEAL_SLOTS[mealSlot].toLowerCase()} that day.`,
      code: 'already_planned',
      meal_slots: [Number(mealSlot)],
    })
  }
  res.status(201).json(rows[0])
})

// DELETE /api/users/:userId/calendar/:calendarId  -> 204, or 404 if it's already gone
// Removes one dish (calendar_id comes from the GET above).
router.delete('/:userId/calendar/:calendarId', async (req, res) => {
  const { userId, calendarId } = req.params
  if (!isPositiveInt(userId) || !isPositiveInt(calendarId)) {
    return res.status(400).json({ error: 'Expected /api/users/:userId/calendar/:calendarId' })
  }

  const { rowCount } = await pool.query(
    'delete from calendar where user_id = $1 and calendar_id = $2',
    [userId, calendarId]
  )
  if (rowCount === 0) {
    return res.status(404).json({ error: 'That meal is not on the calendar' })
  }
  res.status(204).end()
})

export default router
