// Run with:  npm start   (or npm run dev to restart on file changes)
// Serves the API under /api and the frontend page at http://localhost:3000
import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import { RedisStore } from 'connect-redis'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'
import { redis, SESSION_PREFIX } from './redis.js'
import ingredientsRouter from './routes/ingredients.js'
import recipesRouter from './routes/recipes.js'
import lookupsRouter from './routes/lookups.js'
import calendarRouter from './routes/calendar.js'
import likesRouter from './routes/likes.js'
import pantryRouter from './routes/pantry.js'
import authRouter, { loadUser, requireLogin } from './routes/auth.js'
import searchRouter from './routes/search.js'
import recipeAssistantRouter from './routes/recipeAssistant.js'

if (!process.env.SESSION_SECRET) {
  throw new Error('Missing SESSION_SECRET. Add it to .env (see .env.example).')
}

// The per-user tables come from db/migrations. Fail with a clear message
// instead of confusing errors on every page if they haven't been run yet.
const { rows: missingTables } = await pool.query(
  `select name from unnest(array['user_pantry', 'user_liked_recipes']) as name
   where to_regclass('public.' || name) is null`
)
if (missingTables.length > 0) {
  throw new Error(
    `Missing tables: ${missingTables.map((row) => row.name).join(', ')}. Run: npm run db:migrate`
  )
}

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

// Behind a hosting proxy (Render, Railway, ...) this lets secure cookies work.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)

app.use(express.json())
// Parses the login and signup form posts
app.use(express.urlencoded({ extended: false }))

// Logged-in state. The browser only holds a random session id in the "sid"
// cookie; req.session.userId is kept in Redis (under sess:<sid>), so people
// stay logged in when the server restarts. Redis deletes each session by
// itself when the cookie's maxAge runs out.
app.use(
  session({
    name: 'sid',
    store: new RedisStore({ client: redis, prefix: SESSION_PREFIX }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
)

// CSS, images and scripts load without logging in, so the login page has its styles.
app.use(express.static(publicPath))

// Pages and API responses depend on who is logged in, so browsers must not
// keep copies. Without this, pressing Back after logging out shows the
// saved pages again. (CSS/JS/images above can still be cached.)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// req.user / currentUser for everything below
app.use(loadUser)

// /login, /signup, /logout, /forgot-password, /reset-password, /account/password
app.use(authRouter)

// Visiting the site: logged-in users go home, everyone else logs in first.
app.get('/', (req, res) => {
  res.redirect(req.user ? '/home' : '/login')
})

// Every page and API route below this line needs a logged-in user.
app.use(requireLogin)

// Shared data (writes are admin-only, see the route files)
app.use('/api/ingredients', ingredientsRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api', lookupsRouter)

// The logged-in user's own data
app.use('/api/me/calendar', calendarRouter)
app.use('/api/me/likes', likesRouter)
app.use('/api/me/pantry', pantryRouter)

// Recipes page's "Add your own recipe" assistant: /api/recipe-assistant/...
app.use('/api', recipeAssistantRouter)

// Render the home page from its EJS view.
app.get(['/home', '/index.html'], (req, res) => {
  res.render('index', { active: 'home' })
})

// Render the meal plan page. Its script loads meals from /api/me/calendar.
app.get(['/calendar', '/calendar.html'], (req, res) => {
  res.render('calendar', { active: 'calendar' })
})

// Render the Recipes page (/recipes?q=&filter=&date=&slot=; old /search links redirect). See routes/search.js.
app.use(searchRouter)

// Render the recipes this user has liked. inPantry / toBuy count each
// recipe's ingredients against this user's pantry.
app.get(['/liked', '/liked.html'], async (req, res) => {
  const { rows } = await pool.query(
    `select r.recipe_id,
            r.recipe_title as title,
            coalesce(r.prep_time, 0)::int as time,
            coalesce(rc.recipe_class_desc, 'Recipe') as tag,
            coalesce(r.instructions, 'A recipe saved to your collection.') as description,
            count(ri.ingredient_id) filter (
              where up.pantry_amount_id in (0, 1)
            )::int as "inPantry",
            count(ri.ingredient_id) filter (
              where up.pantry_amount_id is null or up.pantry_amount_id = 2
            )::int as "toBuy"
     from user_liked_recipes ul
     join recipes r on r.recipe_id = ul.recipe_id
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     left join recipe_ingredients ri on ri.recipe_id = r.recipe_id
     left join user_pantry up on up.ingredient_id = ri.ingredient_id and up.user_id = ul.user_id
     where ul.user_id = $1
     group by r.recipe_id, rc.recipe_class_desc
     order by r.recipe_title`,
    [req.user.user_id]
  )

  res.render('liked', {
    recipes: rows,
    title: 'Liked recipes',
    active: 'liked',
  })
})

// Render this user's pantry with server-side data for EJS and its partials.
app.get(['/pantry', '/pantry.html', '/pantry.ejs'], async (req, res) => {
  const { rows } = await pool.query(
    `select up.ingredient_id, i.ingredient_name, up.pantry_amount_id
     from user_pantry up
     join ingredients i on i.ingredient_id = up.ingredient_id
     where up.user_id = $1
     order by up.pantry_amount_id, lower(i.ingredient_name), up.ingredient_id`,
    [req.user.user_id]
  )
  const items = rows.map((row) => ({
    ingredient_id: row.ingredient_id,
    name: row.ingredient_name,
    pantry_amount_id: row.pantry_amount_id,
    status: statusByPantryAmount[row.pantry_amount_id],
  }))

  res.render('pantry', {
    items,
    statuses,
    active: 'pantry',
  })
})

// Shopping list page. Sample data for now; later this will come from the
// calendar, recipe_ingredients and pantry tables.
app.get(['/shopping', '/shopping.html'], (req, res) => {
  const items = [
    { name: 'Broccolini', forRecipe: 'Sesame miso salmon', amount: '250g' },
    { name: 'Salmon fillets', forRecipe: 'Sesame miso salmon', amount: '2' },
    { name: 'Zucchini', forRecipe: 'Creamy lemon orzo', amount: '2' },
    { name: 'Fresh parsley', forRecipe: 'Shakshuka + orzo', amount: '1 bunch' },
    { name: 'Lemons', forRecipe: 'Flatbread + orzo', amount: '3' },
  ]

  res.render('shopping', { items, active: 'shopping' })
})

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
