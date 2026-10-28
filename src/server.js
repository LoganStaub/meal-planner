// Run with:  npm start   (or npm run dev to restart on file changes)
// Serves the API under /api and the frontend page at http://localhost:3000
import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import ingredientsRouter from './routes/ingredients.js'
import recipesRouter from './routes/recipes.js'
import lookupsRouter from './routes/lookups.js'
import calendarRouter from './routes/calendar.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

app.use('/api/ingredients', ingredientsRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api', lookupsRouter)
app.use('/api/users', calendarRouter)

// The frontend lives in mp-vertical-slice/. Serving it from the same
// server means the page can call /api/... without any CORS setup.
app.use(express.static(fileURLToPath(new URL('../mp-vertical-slice', import.meta.url))))

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
