// Who may rate a recipe: only someone who has made it. "Made it" means the
// recipe has been on their meal plan (the calendar table) for today or an
// earlier day, so they can rate it the same day it's planned. "Today" is in
// APP_TIME_ZONE, like the shopping list (Render's servers run on UTC).
//
// Ratings given before this rule stay; they just can't be changed until the
// recipe has been planned.
import { pool } from './db.js'

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Denver'

// Two columns for a query that already has a user and a recipe in it:
//   can_rate   true once the recipe was planned for today or earlier
//   rate_from  'YYYY-MM-DD' of the next planned day when they can't rate
//              yet (null if it isn't planned at all)
// userRef / recipeRef are SQL for the user and recipe ids (e.g. '$1',
// 'r.recipe_id'); tzRef is the parameter holding APP_TIME_ZONE.
export function rateColumns(userRef, recipeRef, tzRef) {
  const today = `(now() at time zone ${tzRef}::text)::date`
  return `exists (
              select 1 from calendar c
              where c.user_id = ${userRef} and c.recipe_id = ${recipeRef} and c.date <= ${today}
            ) as can_rate,
            (select to_char(min(c.date), 'YYYY-MM-DD') from calendar c
             where c.user_id = ${userRef} and c.recipe_id = ${recipeRef} and c.date > ${today}
            ) as rate_from`
}

// For the ratings API: may this user rate this recipe right now?
export async function canRate(userId, recipeId) {
  const { rows } = await pool.query(
    `select ${rateColumns('$1', '$2', '$3')}`,
    [userId, recipeId, APP_TIME_ZONE]
  )
  return rows[0].can_rate
}
