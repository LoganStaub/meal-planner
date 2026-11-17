// The logged-in user's recipe ratings: /api/me/ratings
//
// Privacy: a user's own rating (user_recipe_ratings) is only ever sent back
// to that same user. Everyone else only sees the recipe's anonymous totals
// (recipe_rating_stats), which a database trigger keeps in sync. See
// db/migrations/009_recipe_ratings.sql.
import { Router } from 'express'
import { pool } from '../db.js'
import { isPositiveInt, isRating } from '../validators.js'

const router = Router()

// The recipe's totals after a change, e.g. { average: 4.33, count: 3 }
async function recipeTotals(recipeId) {
  const { rows } = await pool.query(
    'select rating_avg, rating_count from recipe_rating_stats where recipe_id = $1',
    [recipeId]
  )
  return {
    average: rows[0]?.rating_avg == null ? null : Number(rows[0].rating_avg),
    count: rows[0]?.rating_count ?? 0,
  }
}

// GET /api/me/ratings  -> { "<recipe_id>": rating, ... }  (only this user's)
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'select recipe_id, rating from user_recipe_ratings where user_id = $1',
    [req.user.user_id]
  )
  res.json(Object.fromEntries(rows.map((row) => [row.recipe_id, row.rating])))
})

// PUT /api/me/ratings/:recipeId  { rating: 1-5 }
//   -> { recipe_id, my_rating, average, count }
// Rating the same recipe again changes the rating; it never counts twice.
router.put('/:recipeId', async (req, res) => {
  const { recipeId } = req.params
  const rating = req.body?.rating
  if (!isPositiveInt(recipeId)) {
    return res.status(400).json({ error: 'recipeId must be a positive integer' })
  }
  if (!isRating(rating)) {
    return res.status(400).json({ error: 'rating must be a whole number from 1 to 5' })
  }

  const { rowCount } = await pool.query(
    `insert into user_recipe_ratings (user_id, recipe_id, rating)
     select $1, recipe_id, $3 from recipes where recipe_id = $2
     on conflict (user_id, recipe_id) do update
     set rating = excluded.rating, updated_at = now()`,
    [req.user.user_id, recipeId, rating]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Recipe not found' })

  res.json({ recipe_id: Number(recipeId), my_rating: rating, ...(await recipeTotals(recipeId)) })
})

// DELETE /api/me/ratings/:recipeId  -> { recipe_id, my_rating: null, average, count }
// Removing a rating that doesn't exist is fine.
router.delete('/:recipeId', async (req, res) => {
  const { recipeId } = req.params
  if (!isPositiveInt(recipeId)) {
    return res.status(400).json({ error: 'recipeId must be a positive integer' })
  }

  await pool.query('delete from user_recipe_ratings where user_id = $1 and recipe_id = $2', [
    req.user.user_id,
    recipeId,
  ])
  res.json({ recipe_id: Number(recipeId), my_rating: null, ...(await recipeTotals(recipeId)) })
})

export default router
