// The logged-in user's shopping list: /api/me/shopping
//
// The list is every ingredient of the recipes on this user's calendar for the
// next week, minus what their pantry already has plenty of. An ingredient shows
// up if it isn't in the pantry at all, or is marked "running low" (1) or
// "none" (2). Amounts are text like "1/2" or "to taste", so they are listed
// per recipe instead of being added together.
import { Router } from 'express'
import { pool } from '../db.js'
import { isPositiveInt } from '../validators.js'

const router = Router()

// Render's servers run on UTC, so "today" has to use the app's time zone.
const TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Denver'
const DAYS_AHEAD = 6 // today + 6 more days = 7 days

// measurements.measurement_desc -> short label shown on the list
const UNIT_LABELS = {
  Cup: 'cup',
  Tablespoon: 'Tbsp',
  Teaspoon: 'tsp',
  Ounce: 'oz',
  Pound: 'lb',
  Gram: 'g',
  Each: '',
}

// "1/2" + "Cup" -> "1/2 cup". The same recipe planned twice adds " x2".
function formatAmount(amount, unit, times) {
  const label = unit ? (UNIT_LABELS[unit] ?? unit.toLowerCase()) : ''
  const text = [amount, label].filter(Boolean).join(' ')
  return times > 1 && text ? `${text} x${times}` : text
}

// Returns [{ ingredient_id, name, forRecipe, amount }, ...] for the shopping page.
export async function getShoppingItems(userId) {
  const { rows } = await pool.query(
    `select i.ingredient_id,
            i.ingredient_name,
            r.recipe_title,
            ri.amount,
            m.measurement_desc,
            count(*)::int as times
     from calendar c
     join recipes r on r.recipe_id = c.recipe_id
     join recipe_ingredients ri on ri.recipe_id = c.recipe_id
     join ingredients i on i.ingredient_id = ri.ingredient_id
     left join measurements m on m.measure_amount_id = ri.measure_amount_id
     left join user_pantry up on up.user_id = c.user_id and up.ingredient_id = ri.ingredient_id
     where c.user_id = $1
       and c.date between (now() at time zone $2::text)::date
                      and (now() at time zone $2::text)::date + $3::int
       and (up.pantry_amount_id is null or up.pantry_amount_id in (1, 2))
     group by i.ingredient_id, i.ingredient_name, r.recipe_id, r.recipe_title, ri.amount, m.measurement_desc
     order by lower(i.ingredient_name), r.recipe_title`,
    [userId, TIME_ZONE, DAYS_AHEAD]
  )

  // One list row per ingredient, with every recipe that needs it
  const byIngredient = new Map()
  for (const row of rows) {
    if (!byIngredient.has(row.ingredient_id)) {
      byIngredient.set(row.ingredient_id, {
        ingredient_id: row.ingredient_id,
        name: row.ingredient_name,
        recipes: [],
        amounts: [],
      })
    }
    const item = byIngredient.get(row.ingredient_id)
    item.recipes.push(row.recipe_title)
    const amount = formatAmount(row.amount, row.measurement_desc, row.times)
    if (amount) item.amounts.push(amount)
  }

  return [...byIngredient.values()].map((item) => ({
    ingredient_id: item.ingredient_id,
    name: item.name,
    forRecipe: [...new Set(item.recipes)].join(', '),
    amount: item.amounts.join(' + '),
  }))
}

// GET /api/me/shopping  -> the same list the page shows
router.get('/', async (req, res) => {
  res.json(await getShoppingItems(req.user.user_id))
})

// PUT /api/me/shopping/:ingredientId/got  { got: true | false }  -> 204
// Ticking an item ("got it") puts it in the pantry as "plenty left" (0).
// Unticking sets it back to "none" (2). Works whether or not the ingredient
// is already in the pantry.
router.put('/:ingredientId/got', async (req, res) => {
  const { ingredientId } = req.params
  if (!isPositiveInt(ingredientId)) {
    return res.status(400).json({ error: 'ingredientId must be a positive integer' })
  }
  if (typeof req.body?.got !== 'boolean') {
    return res.status(400).json({ error: 'Expected { got: true } or { got: false }' })
  }

  await pool.query(
    `insert into user_pantry (user_id, ingredient_id, pantry_amount_id)
     values ($1, $2, $3)
     on conflict (user_id, ingredient_id)
     do update set pantry_amount_id = excluded.pantry_amount_id`,
    [req.user.user_id, ingredientId, req.body.got ? 0 : 2]
  )
  res.status(204).end()
})

export default router