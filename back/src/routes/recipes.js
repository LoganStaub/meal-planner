// Recipes: /api/recipes
import { Router } from 'express'
import { pool } from '../db.js'
import { requireAdmin } from './auth.js'

const router = Router()

// GET /api/recipes  -> all recipes, with their class name joined in.
// liked is true when the logged-in user has liked the recipe.
// rating_avg / rating_count are the recipe's anonymous totals; my_rating is
// only the logged-in user's own rating (null if they haven't rated it).
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `select r.recipe_id, r.recipe_title, r.cost, r.prep_time, rc.recipe_class_desc,
            exists (
              select 1 from user_liked_recipes ul
              where ul.recipe_id = r.recipe_id and ul.user_id = $1
            ) as liked,
            rs.rating_avg::float as rating_avg,
            coalesce(rs.rating_count, 0) as rating_count,
            ur.rating as my_rating
     from recipes r
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     left join recipe_rating_stats rs on rs.recipe_id = r.recipe_id
     left join user_recipe_ratings ur on ur.recipe_id = r.recipe_id and ur.user_id = $1
     order by r.recipe_title`,
    [req.user.user_id]
  )
  res.json(rows)
})

// One recipe with its ingredient list (in order), or null if it doesn't exist.
// Used by GET /api/recipes/:id and the recipe page (/recipes/:id, routes/search.js).
//   liked: this user has liked it (recipes.liked is the old shared column)
//   added_by: first name of the user who added it with the AI assistant
//   rating_avg / rating_count: the recipe's anonymous totals; my_rating: only
//     this user's own rating (null if they haven't rated it)
//   recipe_ingredients[].pantry_amount_id: this user's own pantry: 0 plenty,
//     1 running low, 2 none, and null when it isn't in their pantry at all
export async function getRecipe(recipeId, userId) {
  const recipe = await pool.query(
    `select r.*, rc.recipe_class_desc, u.first_name as added_by,
            exists (
              select 1 from user_liked_recipes ul
              where ul.recipe_id = r.recipe_id and ul.user_id = $2
            ) as liked,
            rs.rating_avg::float as rating_avg,
            coalesce(rs.rating_count, 0) as rating_count,
            ur.rating as my_rating
     from recipes r
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     left join users u on u.user_id = r.created_by
     left join recipe_rating_stats rs on rs.recipe_id = r.recipe_id
     left join user_recipe_ratings ur on ur.recipe_id = r.recipe_id and ur.user_id = $2
     where r.recipe_id = $1`,
    [recipeId, userId]
  )
  if (recipe.rows.length === 0) return null

  const ingredients = await pool.query(
    `select ri.recipe_seq_number, ri.amount, i.ingredient_id, i.ingredient_name,
            m.measurement_desc, up.pantry_amount_id
     from recipe_ingredients ri
     join ingredients i on i.ingredient_id = ri.ingredient_id
     left join measurements m on m.measure_amount_id = ri.measure_amount_id
     left join user_pantry up on up.ingredient_id = ri.ingredient_id and up.user_id = $2
     where ri.recipe_id = $1
     order by ri.recipe_seq_number`,
    [recipeId, userId]
  )
  return { ...recipe.rows[0], recipe_ingredients: ingredients.rows }
}

// GET /api/recipes/:id  -> one recipe with its ingredient list (getRecipe above)
router.get('/:id', async (req, res) => {
  const recipe = await getRecipe(req.params.id, req.user.user_id)
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' })
  }
  res.json(recipe)
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
