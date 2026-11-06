// The logged-in user's liked recipes: /api/me/likes
import { Router } from 'express'
import { pool } from '../db.js'
import { isPositiveInt } from '../validators.js'

const router = Router()

// GET /api/me/likes  -> [recipe_id, ...]
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'select recipe_id from user_liked_recipes where user_id = $1 order by liked_at desc',
    [req.user.user_id]
  )
  res.json(rows.map((row) => row.recipe_id))
})

// PUT /api/me/likes/:recipeId  -> 204 (liking twice is fine)
router.put('/:recipeId', async (req, res) => {
  const { recipeId } = req.params
  if (!isPositiveInt(recipeId)) {
    return res.status(400).json({ error: 'recipeId must be a positive integer' })
  }

  const { rowCount } = await pool.query(
    `insert into user_liked_recipes (user_id, recipe_id)
     select $1, recipe_id from recipes where recipe_id = $2
     on conflict do nothing`,
    [req.user.user_id, recipeId]
  )
  if (rowCount === 0) {
    // Nothing inserted: either it was already liked, or the recipe doesn't exist
    const { rows } = await pool.query('select 1 from recipes where recipe_id = $1', [recipeId])
    if (rows.length === 0) return res.status(404).json({ error: 'Recipe not found' })
  }
  res.status(204).end()
})

// DELETE /api/me/likes/:recipeId  -> 204 (unliking twice is fine)
router.delete('/:recipeId', async (req, res) => {
  const { recipeId } = req.params
  if (!isPositiveInt(recipeId)) {
    return res.status(400).json({ error: 'recipeId must be a positive integer' })
  }

  await pool.query('delete from user_liked_recipes where user_id = $1 and recipe_id = $2', [
    req.user.user_id,
    recipeId,
  ])
  res.status(204).end()
})

export default router
