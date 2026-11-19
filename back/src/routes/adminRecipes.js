// Admin API for "Maintain Recipes": /api/admin/recipes
// Every route needs an admin (requireAdmin). Ingredient lines are not edited
// here; this covers the recipe's own fields.
import { Router } from 'express'
import { pool } from '../db.js'
import { requireAdmin } from './auth.js'

const router = Router()
router.use(requireAdmin)

const isId = (value) => /^\d{1,9}$/.test(String(value))
const blankToNull = (value) =>
  value === undefined || (typeof value === 'string' && value.trim() === '') ? null : value

// Reads and checks the recipe fields from a request body.
// partial = false (new recipe): every field is read.
// partial = true (edit): only the fields that were sent are read.
// Returns { error } or { values: { column: value } }.
function readRecipeFields(body, partial) {
  const values = {}
  const has = (field) => !partial || field in body

  if (has('recipe_title')) {
    const title = typeof body.recipe_title === 'string' ? body.recipe_title.trim() : ''
    if (!title) return { error: 'Recipe title is required.' }
    if (title.length > 200) return { error: 'Recipe title is too long (200 characters max).' }
    values.recipe_title = title
  }

  if (has('recipe_class_id')) {
    const raw = blankToNull(body.recipe_class_id)
    const classId = raw === null ? null : Number(raw)
    if (classId !== null && !Number.isInteger(classId)) return { error: 'Pick a meal type.' }
    values.recipe_class_id = classId
  }

  // Cost and prep time (minutes) are optional numbers
  for (const [field, label] of [['cost', 'Cost'], ['prep_time', 'Prep time']]) {
    if (!has(field)) continue
    const raw = blankToNull(body[field])
    const number = raw === null ? null : Number(raw)
    if (number !== null && (!Number.isFinite(number) || number < 0)) {
      return { error: `${label} must be a number, 0 or more.` }
    }
    values[field] = number
  }

  // Free text fields: blank means "none"
  for (const field of ['macros', 'instructions']) {
    if (!has(field)) continue
    const raw = blankToNull(body[field])
    values[field] = raw === null ? null : String(raw).trim() || null
  }

  // The photo's address on this site, e.g. /images/recipes/lasagna.jpg
  if (has('image_path')) {
    const raw = blankToNull(body.image_path)
    const path = raw === null ? null : String(raw).trim()
    if (path && !path.startsWith('/images/')) return { error: 'Photo path must start with /images/.' }
    values.image_path = path
  }

  return { values }
}

// Everything the admin page shows for a recipe. planned_count is how many
// meal plan entries use it (deleting the recipe removes those too).
const RECIPE_FIELDS = `r.recipe_id, r.recipe_title, r.recipe_class_id, rc.recipe_class_desc,
       r.cost, r.prep_time, r.macros, r.instructions, r.image_path,
       (select count(*) from calendar c where c.recipe_id = r.recipe_id)::int as planned_count`

async function loadRecipe(recipeId) {
  const { rows } = await pool.query(
    `select ${RECIPE_FIELDS}
     from recipes r
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     where r.recipe_id = $1`,
    [recipeId]
  )
  return rows[0]
}

// GET /api/admin/recipes  -> { recipes, classes } (classes fill the meal type dropdown)
router.get('/', async (req, res) => {
  const [recipes, classes] = await Promise.all([
    pool.query(
      `select ${RECIPE_FIELDS}
       from recipes r
       left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
       order by lower(r.recipe_title)`
    ),
    pool.query('select recipe_class_id, recipe_class_desc from recipe_classes order by recipe_class_id'),
  ])
  res.json({ recipes: recipes.rows, classes: classes.rows })
})

// POST /api/admin/recipes  { recipe_title, recipe_class_id?, cost?, prep_time?, macros?, instructions?, image_path? }
router.post('/', async (req, res) => {
  const { error, values } = readRecipeFields(req.body, false)
  if (error) return res.status(400).json({ error })

  // Column names come from readRecipeFields' fixed list, never from the request
  const columns = Object.keys(values)
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await pool.query(
    `insert into recipes (${columns.join(', ')}) values (${placeholders}) returning recipe_id`,
    columns.map((column) => values[column])
  )
  res.status(201).json(await loadRecipe(rows[0].recipe_id))
})

// PATCH /api/admin/recipes/:id  any of the same fields; only those sent change
router.patch('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Bad recipe id.' })
  const { error, values } = readRecipeFields(req.body, true)
  if (error) return res.status(400).json({ error })

  const columns = Object.keys(values)
  if (columns.length === 0) return res.status(400).json({ error: 'Nothing to change.' })

  const setClause = columns.map((column, i) => `${column} = $${i + 1}`).join(', ')
  const { rowCount } = await pool.query(
    `update recipes set ${setClause} where recipe_id = $${columns.length + 1}`,
    [...columns.map((column) => values[column]), req.params.id]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'Recipe not found.' })
  res.json(await loadRecipe(req.params.id))
})

// DELETE /api/admin/recipes/:id
// Likes, ratings and ingredient lines are removed by the database. Meal plan
// entries are not (the table blocks it), so they are removed here first, in
// the same transaction: either everything is deleted or nothing is.
router.delete('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Bad recipe id.' })

  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from calendar where recipe_id = $1', [req.params.id])
    const { rowCount } = await client.query('delete from recipes where recipe_id = $1', [req.params.id])
    if (rowCount === 0) {
      await client.query('rollback')
      return res.status(404).json({ error: 'Recipe not found.' })
    }
    await client.query('commit')
    res.status(204).end()
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
})

export default router