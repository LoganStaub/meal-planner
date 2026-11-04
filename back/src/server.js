// Run with:  npm start   (or npm run dev to restart on file changes)
// Serves the API under /api and the frontend page at http://localhost:3000
import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'
import ingredientsRouter from './routes/ingredients.js'
import recipesRouter from './routes/recipes.js'
import lookupsRouter from './routes/lookups.js'
import calendarRouter from './routes/calendar.js'

const app = express()
const PORT = process.env.PORT || 3000
const viewsPath = fileURLToPath(new URL('../../front/views', import.meta.url))
const publicPath = fileURLToPath(new URL('../../front/public', import.meta.url))

const statuses = {
  plenty: { id: 0, label: 'Plenty left' },
  low: { id: 1, label: 'Running low' },
  none: { id: 2, label: 'None' },
}
const statusByPantryAmount = { 0: 'plenty', 1: 'low', 2: 'none' }

app.set('view engine', 'ejs')
app.set('views', viewsPath)

app.use(express.json())

app.use('/api/ingredients', ingredientsRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api', lookupsRouter)
app.use('/api/users', calendarRouter)

// Render the home page from its EJS view.
app.get(['/', '/index.html'], (req, res) => {
  res.render('index', { active: 'home', user: { initials: 'M' } })
})

// Render the user's saved recipes from the recipes table.
app.get(['/liked', '/liked.html'], async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select r.recipe_id,
              r.recipe_title as title,
              coalesce(r.prep_time, 0)::int as time,
              coalesce(rc.recipe_class_desc, 'Recipe') as tag,
              coalesce(r.instructions, 'A recipe saved to your collection.') as description,
              count(ri.ingredient_id) filter (
                where i.pantry_amount_id in (0, 1)
              )::int as "inPantry",
              count(ri.ingredient_id) filter (
                where i.pantry_amount_id is null or i.pantry_amount_id = 2
              )::int as "toBuy"
       from recipes r
       left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
       left join recipe_ingredients ri on ri.recipe_id = r.recipe_id
       left join ingredients i on i.ingredient_id = ri.ingredient_id
       where r.liked = true
       group by r.recipe_id, rc.recipe_class_desc
       order by r.recipe_title`
    )

    res.render('liked', {
      recipes: rows,
      title: 'Liked recipes',
      active: 'liked',
      user: { initials: 'M' },
    })
  } catch (error) {
    next(error)
  }
})

// Render the pantry with server-side data for EJS and its partials.
app.get(['/pantry', '/pantry.html', '/pantry.ejs'], async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `select ingredient_id, ingredient_name, pantry_amount_id
       from ingredients
       order by coalesce(pantry_amount_id, 0), lower(ingredient_name), ingredient_id`
    )
    const items = rows.map((row) => {
      const pantryAmountId = statusByPantryAmount[row.pantry_amount_id] ? row.pantry_amount_id : 0
      return {
        ingredient_id: row.ingredient_id,
        name: row.ingredient_name,
        pantry_amount_id: pantryAmountId,
        status: statusByPantryAmount[pantryAmountId],
      }
    })

    res.render('pantry', {
      items,
      statuses,
      active: 'pantry',
      user: { initials: 'M' },
    })
  } catch (error) {
    next(error)
  }
})

// The frontend lives in the sibling front/ folder. Serving it from the same
// server means pages can call /api/... without any CORS setup.
app.use(express.static(publicPath))

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Express 5 sends errors thrown in async routes here automatically
app.use((err, req, res, next) => {
  // Postgres error codes for bad input, e.g. /api/ingredients/abc or a
  // recipe_class_id that doesn't exist
  if (err.code === '22P02' || err.code === '23503' || err.code === '22007') {
    return res.status(400).json({ error: err.message })
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' })
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server' })
})

app.listen(PORT, () => {
  console.log(`✅ Meal Planner running at http://localhost:${PORT}`)
})