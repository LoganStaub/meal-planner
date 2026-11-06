// Recipes: /api/recipes
import { Router } from 'express'
import { pool } from '../db.js'
import { requireAdmin } from './auth.js'

const router = Router()

// GET /api/recipes  -> all recipes, with their class name joined in.
// liked is true when the logged-in user has liked the recipe.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `select r.recipe_id, r.recipe_title, r.cost, r.prep_time, rc.recipe_class_desc,
            exists (
              select 1 from user_liked_recipes ul
              where ul.recipe_id = r.recipe_id and ul.user_id = $1
            ) as liked
     from recipes r
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     order by r.recipe_title`,
    [req.user.user_id]
  )
  res.json(rows)
})

// GET /api/recipes/:id  -> one recipe with its ingredient list (in order)
router.get('/:id', async (req, res) => {
  // recipes.liked is the old shared column; liked here is this user's own like
  const recipe = await pool.query(
    `select r.*, exists (
              select 1 from user_liked_recipes ul
              where ul.recipe_id = r.recipe_id and ul.user_id = $2
            ) as liked
     from recipes r where r.recipe_id = $1`,
    [req.params.id, req.user.user_id]
  )
  if (recipe.rows.length === 0) {
    return res.status(404).json({ error: 'Recipe not found' })
  }

  const ingredients = await pool.query(
    `select ri.recipe_seq_number, ri.amount, i.ingredient_name, m.measurement_desc
     from recipe_ingredients ri
     join ingredients i on i.ingredient_id = ri.ingredient_id
     left join measurements m on m.measure_amount_id = ri.measure_amount_id
     where ri.recipe_id = $1
     order by ri.recipe_seq_number`,
    [req.params.id]
  )
  res.json({ ...recipe.rows[0], recipe_ingredients: ingredients.rows })
})

// POST /api/recipes  { recipe_title, recipe_class_id?, cost?, prep_time?, macros?, instructions? }
// Admins only: recipes are shared by every user.
router.post('/', requireAdmin, async (req, res) => {
  const { recipe_title, recipe_class_id, cost, prep_time, macros, instructions } = req.body
  if (!recipe_title?.trim()) {
    return res.status(400).json({ error: 'recipe_title is required' })
  }

  const { rows } = await pool.query(
    `insert into recipes (recipe_title, recipe_class_id, cost, prep_time, macros, instructions)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [recipe_title.trim(), recipe_class_id ?? null, cost ?? null, prep_time ?? null,
      macros ?? null, instructions ?? null]
  )
  res.status(201).json(rows[0])
})

export default router
