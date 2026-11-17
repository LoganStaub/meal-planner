// The logged-in user's meal plan: /api/me/calendar
// The user always comes from the session (req.user), never from the URL,
// so nobody can read or change someone else's calendar.
import { Router } from 'express'
import { pool } from '../db.js'
import { isDateKey, isPositiveInt } from '../validators.js'
import { logEvent } from '../events.js'

const router = Router()

// Where an "add to calendar" started, sent by the page as entry_point so the
// OKR numbers can be split by it (src/routes/admin.js):
//   home_card       the Home page card's Add to calendar button
//   recipe_details  the recipe window's Add to calendar button
//   calendar        a + / Add link on the calendar, then Add on the Recipes page
const ENTRY_POINTS = new Set(['home_card', 'recipe_details', 'calendar'])

// meal_slot: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert
// (matches the check constraint in db/schema.sql)
export const MEAL_SLOTS = { 1: 'Breakfast', 2: 'Lunch', 3: 'Dinner', 4: 'Snack', 5: 'Dessert' }

// Accepts 3 or "3"; rejects 6, "3.0", [3], "constructor"…
function isMealSlot(value) {
  return (typeof value === 'number' || typeof value === 'string') &&
    /^\d$/.test(String(value)) && Object.hasOwn(MEAL_SLOTS, String(value))
}

// GET /api/me/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
// -> [{ calendar_id, date: 'YYYY-MM-DD', meal_slot, recipe_id, recipe_title }, ...]
// A meal can have several dishes; they come back in the order they were added.
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
    `select c.calendar_id, to_char(c.date, 'YYYY-MM-DD') as date, c.meal_slot, r.recipe_id, r.recipe_title
     from calendar c
     join recipes r on r.recipe_id = c.recipe_id
     where c.user_id = $1 and c.date between $2::date and $3::date
     order by c.date, c.meal_slot, c.calendar_id`,
    [req.user.user_id, start, end]
  )
  res.json(rows)
})

// POST /api/me/calendar  { date: 'YYYY-MM-DD', meal_slot, recipe_id, allow_duplicate?, entry_point? }
// -> 201 with the new row. A meal can have several dishes, so this adds one more.
//
// If the recipe is already planned that day it answers 409 with
// { code: 'already_planned', meal_slots: [3, …] } so the page can ask first:
//   * in another meal (lunch, now dinner): send again with allow_duplicate: true
//   * in this same meal: can't be added twice, even with allow_duplicate
//
// Logs add_to_calendar_completed when the row is saved, and
// add_to_calendar_error when the add fails (src/events.js). The "add it
// again?" question for another meal isn't an error, so it isn't logged.
router.post('/', async (req, res) => {
  const userId = req.user.user_id
  const { date, meal_slot: mealSlot, recipe_id: recipeId, allow_duplicate: allowDuplicate } = req.body ?? {}
  const entryPoint = ENTRY_POINTS.has(req.body?.entry_point) ? req.body.entry_point : 'unknown'
  const logError = (message) =>
    logEvent(userId, 'add_to_calendar_error', { message, entry_point: entryPoint, source: 'server' })

  if (!isDateKey(date) || !isMealSlot(mealSlot) || !isPositiveInt(String(recipeId))) {
    const error = 'Expected { date: "YYYY-MM-DD", meal_slot: 1-5, recipe_id: positive integer }'
    logError(error)
    return res.status(400).json({ error })
  }

  try {
    return await addMeal(res, { userId, date, mealSlot, recipeId, allowDuplicate, entryPoint, logError })
  } catch (error) {
    // e.g. a recipe that doesn't exist, or the database is down.
    // server.js still sends the error response.
    logError(error.message)
    throw error
  }
})

async function addMeal(res, { userId, date, mealSlot, recipeId, allowDuplicate, entryPoint, logError }) {
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
    const error = `That recipe is already planned for ${where} that day.`
    // Same meal: it can't be added at all. Another meal: just a question.
    if (inSameMeal) logError(error)
    return res.status(409).json({
      error,
      code: 'already_planned',
      meal_slots: plannedSlots,
    })
  }

  // A recipe that doesn't exist fails the foreign key (400 in server.js).
  // on conflict still guards against two clicks landing at the same moment.
  const { rows } = await pool.query(
    `insert into calendar (user_id, date, meal_slot, recipe_id)
     values ($1, $2::date, $3, $4)
     on conflict (user_id, date, meal_slot, recipe_id) do nothing
     returning calendar_id, to_char(date, 'YYYY-MM-DD') as date, meal_slot, recipe_id`,
    [userId, date, mealSlot, recipeId]
  )
  if (rows.length === 0) {
    const error = `That recipe is already planned for ${MEAL_SLOTS[mealSlot].toLowerCase()} that day.`
    logError(error)
    return res.status(409).json({
      error,
      code: 'already_planned',
      meal_slots: [Number(mealSlot)],
    })
  }

  const saved = rows[0]
  logEvent(userId, 'add_to_calendar_completed', {
    entry_point: entryPoint,
    recipe_id: saved.recipe_id,
    planned_date: saved.date,
    meal_type: MEAL_SLOTS[saved.meal_slot],
    calendar_id: saved.calendar_id,
  })
  res.status(201).json(saved)
}

// DELETE /api/me/calendar/:calendarId  -> 204, or 404 if it's already gone
// Removes one dish (calendar_id comes from the GET above).
// Only deletes it if it's on this user's calendar.
router.delete('/:calendarId', async (req, res) => {
  const { calendarId } = req.params
  if (!isPositiveInt(calendarId)) {
    return res.status(400).json({ error: 'Expected /api/me/calendar/:calendarId' })
  }

  const { rowCount } = await pool.query(
    'delete from calendar where user_id = $1 and calendar_id = $2',
    [req.user.user_id, calendarId]
  )
  if (rowCount === 0) {
    return res.status(404).json({ error: 'That meal is not on your meal plan' })
  }
  res.status(204).end()
})

export default router
