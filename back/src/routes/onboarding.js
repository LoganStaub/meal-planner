// The first-visit tour (front/public/js/onboarding.js): /api/me/onboarding
//
//   POST /api/me/onboarding  { status }  -> 204
//        Saves users.onboarding_status (db/migrations/013_onboarding.sql):
//          'skipped'    "No thanks" on the welcome popup
//          'started'    "Show me around". Leaving the tour partway (or
//                       closing the tab) keeps this, which still counts as
//                       done: the welcome popup won't show again.
//          'completed'  reached the last step
//        'skipped' and 'started' only save the first answer. 'completed'
//        also replaces them, e.g. someone who skipped and later replayed the
//        whole tour from the profile menu.
//
//   GET  /api/me/onboarding/dinner?date=YYYY-MM-DD
//        -> { planned: { recipe_id, recipe_title } | null, suggestions: [...] }
//        For the tour's "Plan tonight's dinner" step. planned is a dinner
//        already on that day; suggestions are up to 8 real dinner recipes
//        ({ recipe_id, recipe_title, prep_time }): the user's liked ones
//        first, then quick ones (45 min or less), in a random order.
//
//   POST /api/me/onboarding/dinner  { date, recipe_id }  -> 201 { calendar_id, recipe_id, recipe_title }
//        Adds the recipe the user confirmed as that day's dinner. 409 if the
//        day already has a dinner. It's a normal calendar row, removable from
//        the Meal Plan page. It does NOT log add_to_calendar_* events, so it
//        stays out of the OKR numbers (the tour asks them to plan one on their
//        own instead); it logs onboarding_dinner_planned.
//
// The date comes from the page (the user's own "today"), the same way the
// Meal Plan page picks today.
import { Router } from 'express'
import { pool } from '../db.js'
import { logEvent } from '../events.js'
import { isDateKey, isPositiveInt } from '../validators.js'

const router = Router()

const DINNER = 3 // calendar.meal_slot, see MEAL_SLOTS in routes/calendar.js
const QUICK_MINUTES = 45
const MAX_SUGGESTIONS = 8

// status -> which current statuses it may replace
const REPLACES = {
  skipped: [],
  started: [],
  completed: ['skipped', 'started'],
}

router.post('/', async (req, res) => {
  const status = req.body?.status
  if (!Object.hasOwn(REPLACES, status)) {
    return res.status(400).json({ error: "status must be 'skipped', 'started' or 'completed'" })
  }

  const { rowCount } = await pool.query(
    `update users
     set onboarding_status = $2, onboarding_updated_at = now()
     where user_id = $1
       and (onboarding_status is null or onboarding_status = any($3::text[]))`,
    [req.user.user_id, status, REPLACES[status]]
  )

  // Logged here, not from the page, so the events match what was saved.
  if (rowCount > 0) logEvent(req.user.user_id, `onboarding_${status}`)
  res.status(204).end()
})

router.get('/dinner', async (req, res) => {
  const { date } = req.query
  if (!isDateKey(date)) {
    return res.status(400).json({ error: 'Expected ?date=YYYY-MM-DD' })
  }
  const userId = req.user.user_id

  const { rows: planned } = await pool.query(
    `select c.recipe_id, r.recipe_title
     from calendar c
     join recipes r on r.recipe_id = c.recipe_id
     where c.user_id = $1 and c.date = $2::date and c.meal_slot = $3
     order by c.calendar_id
     limit 1`,
    [userId, date, DINNER]
  )

  // Only recipes with ingredients, so the shopping list has something to show
  const { rows: suggestions } = await pool.query(
    `select r.recipe_id, r.recipe_title, r.prep_time::int as prep_time
     from recipes r
     join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     left join user_liked_recipes ul on ul.recipe_id = r.recipe_id and ul.user_id = $1
     where rc.recipe_class_desc = 'Dinner'
       and exists (select 1 from recipe_ingredients ri where ri.recipe_id = r.recipe_id)
     order by (ul.recipe_id is not null) desc,
              (coalesce(r.prep_time, 999) <= $2) desc,
              random()
     limit $3`,
    [userId, QUICK_MINUTES, MAX_SUGGESTIONS]
  )

  res.json({ planned: planned[0] ?? null, suggestions })
})

router.post('/dinner', async (req, res) => {
  const { date, recipe_id: recipeId } = req.body ?? {}
  if (!isDateKey(date) || !isPositiveInt(String(recipeId))) {
    return res.status(400).json({ error: 'Expected { date: "YYYY-MM-DD", recipe_id: positive integer }' })
  }
  const userId = req.user.user_id

  // Only if that day has no dinner yet. A recipe that doesn't exist fails
  // the foreign key (400 in server.js).
  const { rows } = await pool.query(
    `with added as (
       insert into calendar (user_id, date, meal_slot, recipe_id)
       select $1, $2::date, $3, $4
       where not exists (
         select 1 from calendar where user_id = $1 and date = $2::date and meal_slot = $3
       )
       on conflict (user_id, date, meal_slot, recipe_id) do nothing
       returning calendar_id, recipe_id
     )
     select a.calendar_id, a.recipe_id, r.recipe_title
     from added a join recipes r on r.recipe_id = a.recipe_id`,
    [userId, date, DINNER, recipeId]
  )
  if (rows.length === 0) {
    return res.status(409).json({ error: 'That day already has a dinner planned.', code: 'already_planned' })
  }

  logEvent(userId, 'onboarding_dinner_planned', { recipe_id: rows[0].recipe_id, planned_date: date })
  res.status(201).json(rows[0])
})

export default router
