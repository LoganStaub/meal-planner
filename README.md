# Meal Planner

## App Summary

Deciding what to eat every day, and making sure the right groceries are in the house, takes more time and mental energy than most people have to spare. Young adults and busy professionals feel this the most: they end up eating out, repeating the same few meals, or buying food that goes to waste. Meal Planner is a meal planning and recipe discovery app built for them. Users browse a short swipe feed of recipes, like the ones they want to keep, and place them on a calendar to build a meal plan. A virtual pantry tracks which ingredients they have at home and how much is left. A shopping list and recipe search round out the app, so planning, shopping, and cooking happen in one place. This repository holds the database and the first working feature, the Virtual Pantry.

## ERD

![Entity relationship diagram for Meal Planner](docs/erd.png)

The full schema lives in `back/db/schema.sql`.

## Folder Structure

```text
front/
  views/                EJS page templates and reusable partials
  public/               Browser assets served by Express
    css/                Stylesheets
    images/             Images served to the frontend
    js/                 Browser JavaScript
back/                  Express API, database code, and SQL schema
  src/                 Server and API routes
  db/                  PostgreSQL schema
  scripts/             Database setup scripts
docs/                  Project documentation and diagrams
```

Express renders EJS templates from `front/views/` and serves static assets from
`front/public/`. The browser frontend talks to the backend through HTTP requests
to `/api/...` on the same host, so it can use `fetch('/api/ingredients')` without
extra CORS configuration. The browser never connects directly to PostgreSQL.

| Table                  | Key                                    | What it holds                                             |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| `users`              | `user_id`                            | Profile info; `password_hash` is reserved for login     |
| `recipe_classes`     | `recipe_class_id`                    | Breakfast, Lunch, Dinner…                                |
| `recipes`            | `recipe_id`                          | Title, cost, macros, prep time, instructions, liked       |
| `ingredients`        | `ingredient_id`                      | Ingredient name, pantry amount, default measurement       |
| `measurements`       | `measure_amount_id`                  | Cup, Tablespoon, Gram…                                   |
| `recipe_ingredients` | (`recipe_id`, `recipe_seq_number`) | Which ingredients go in each recipe, in order             |
| `calendar`           | `calendar_id`                        | Each user's planned dishes. `meal_slot`: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert. A meal can hold several dishes, but not the same recipe twice |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Tech Stack

| Layer    | What we used                                                                        |
| -------- | ----------------------------------------------------------------------------------- |
| Frontend | EJS page templates in `front/views/`, with CSS and JavaScript in `front/public/` |
| API      | Node.js + Express 5 (`back/src/server.js`), called from the browser with `fetch`       |
| Database | PostgreSQL, accessed from the server with `node-postgres` (`pg`)                  |
| Tooling  | Node.js 18.18+ (`npm start`, `npm run db:init`, `npm run check`)                  |

**Why this fits our team:** we started on Supabase's hosted backend, but lost access when the free trial ended. Running our own Express server on top of plain Postgres means nothing depends on a paid service: everyone runs the whole stack locally, the schema is SQL in this repo, and the same code can later point at any hosted Postgres (Render, Neon, Railway, etc.) by changing `DATABASE_URL`.

**How the pieces connect:** the browser never talks to the database. The page calls `/api/...` on the Express server, the server runs SQL against Postgres and sends JSON back. The database password lives only in each teammate's git-ignored `.env` file.

## How to Get It Running

1. **Install Node.js 18.18+ and PostgreSQL.** On Windows, the [PostgreSQL installer](https://www.postgresql.org/download/windows/) includes pgAdmin and `psql`. Remember the password you set for the `postgres` user.
2. **Create an empty database** named `meal_planner` (in pgAdmin: right-click Databases → Create, or run `createdb -U postgres meal_planner`).
3. **Clone and install:**
   ```bash
   git clone https://github.com/LoganStaub/meal-planner.git
   cd meal-planner
   cd back
   npm install
   ```
4. **Configure:** from `back/`, copy `.env.example` to `.env` and set `DATABASE_URL`, e.g. `postgres://postgres:YOUR_PASSWORD@localhost:5432/meal_planner`.
5. **Create the tables.** This drops and recreates them, so only run it on a fresh or throwaway database:
   ```bash
   npm run db:init
   ```
6. **Check the connection.** You should see a table of recipe classes (Breakfast, Lunch, …):
   ```bash
   npm run check
   ```
7. **Start the server** and open <http://localhost:3000>:
   ```bash
   npm start        # or: npm run dev  (restarts when you save a file)
   ```
8. **Optional: add test data** for the calendar (user 1 and a few meals this week):
   ```bash
   npm run db:seed
   ```

> Opening the pages by double-clicking them doesn't work for anything that loads data. Pages have to be loaded from the server so their `/api` calls reach Express.

## Pages

| Page    | File                             | URL                                  | Status                                                    |
| ------- | -------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Home    | `front/views/index.ejs` with `front/public/css/index.css` and `front/public/js/index.js` | <http://localhost:3000> | Design done: swipe through 5 meals, recipe popup opens. Meals and photos are placeholder data |
| Pantry  | `front/views/pantry.ejs`, `front/public/css/pantry.css`, `front/public/js/pantry.js`, and `front/public/images/pantry-banner.jpeg` | <http://localhost:3000/pantry> or <http://localhost:3000/pantry.html> | Sorted by inventory level (Plenty left to None); search locally; add with a starting inventory amount, rename, update status, and delete through the database API |
| Liked recipes | `front/views/liked.ejs`, `front/public/css/liked.css`, and `front/public/images/recipes-header.webp` | <http://localhost:3000/liked> or <http://localhost:3000/liked.html> | Lists recipes marked `liked` in the database and summarizes their pantry ingredients |
| Calendar | `front/views/calendar.ejs`, `front/public/css/calendar.css`, and `front/public/js/calendar.js` | <http://localhost:3000/calendar> (add `?date=YYYY-MM-DD` to open a day) | Week view of the meal plan loaded from `/api/users/1/calendar`. Breakfast, Lunch and Dinner each list their dishes ("+ Add another" for more), with a Snacks & desserts group below; remove one dish at a time. Run `npm run db:seed` for test data |
| Search | `front/views/search.ejs`, `front/public/css/search.css` (on top of `calendar.css`), `front/public/js/search.js`, and `back/src/routes/search.js` | <http://localhost:3000/search> (`?q=chicken&filter=dinner`) | Searches recipe names and ingredients; filters for meal type, Quick Meals (prep ≤ 30 min) and High Protein (≥ 25g, read from the `macros` text). Thresholds are constants at the top of `routes/search.js`. From a calendar + button (`?date=YYYY-MM-DD&slot=1-5`) it starts on that meal's filter and shows an "Adding to…" banner with an Add to calendar button (X keeps searching without adding) |
| Shopping, Recipe, Profile | | `/shopping`, `/recipe?id=` | Not built yet. The calendar and search pages already link to these routes |

The home page's recipe details popup is the `<dialog id="recipe-details">` in `front/views/index.ejs`. Its content goes in `#details-body`, and the open recipe's ID is in `dialog.dataset.recipeId`.

## Verifying the Vertical Slice

The vertical slice is **adding an ingredient to the Virtual Pantry**.

1. From `back/`, run `npm start` and open <http://localhost:3000/pantry.html>. The existing ingredients load from the database under **My Ingredients**.
2. Type an ingredient name (for example, `Beans`) into the **Enter ingredient** box.
3. Click **Add+**. The page sends `POST /api/ingredients`, the server inserts the row into Postgres and returns its new ID, and the ingredient appears at the bottom of the list with the status "Plenty Left".
4. Refresh the page (F5). The ingredient is still in the list, because the page reloads everything from the database.
5. Optional: run `select * from ingredients;` in pgAdmin or `psql` to see the new row.

## API Reference

All routes return JSON. Errors look like `{ "error": "message" }`.

| Method | Route                                         | What it does                                                             |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/ingredients`                          | All pantry ingredients                                                   |
| POST   | `/api/ingredients`                          | Add one: `{ ingredient_name, pantry_amount_id? }`                      |
| PATCH  | `/api/ingredients/:id`                      | Change `ingredient_name`, `pantry_amount_id`, and/or `measure_amount_id` |
| DELETE | `/api/ingredients/:id`                      | Delete one (fails with 400 if a recipe uses it)                          |
| GET    | `/api/recipes`                              | All recipes with their class name                                        |
| GET    | `/api/recipes/:id`                          | One recipe with its ordered ingredient list                              |
| POST   | `/api/recipes`                              | Add one: `{ recipe_title, recipe_class_id?, cost?, prep_time?, macros?, instructions? }` |
| GET    | `/api/recipe-classes`                       | Breakfast, Lunch, …                                                      |
| GET    | `/api/measurements`                         | Cup, Tablespoon, …                                                       |
| GET    | `/api/users/:userId/calendar?start=…&end=…` | A user's meal plan between two `YYYY-MM-DD` dates                        |
| POST   | `/api/users/:userId/calendar`               | Add a dish: `{ date, meal_slot (1-5), recipe_id, allow_duplicate? }` (`201`). If the recipe is already planned that day: `409` with `code: 'already_planned'` and `meal_slots`; resend with `allow_duplicate: true` to add it to a different meal anyway |
| DELETE | `/api/users/:userId/calendar/:calendarId`   | Remove one planned dish (`204`, or `404` if it's already gone)           |

## For Teammates

### Calling the API from the frontend

```js
const response = await fetch('/api/recipes')
const recipes = await response.json()

await fetch('/api/ingredients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ingredient_name: 'Beans' }),
})
```

### Adding a new API route

Routes live in `back/src/routes/`, one file per area. Use the shared pool from `back/src/db.js` and **always pass values as `$1, $2…` parameters**, never by pasting them into the SQL string:

```js
const { rows } = await pool.query('select * from recipes where recipe_id = $1', [req.params.id])
```

Then mount the router in `back/src/server.js`.

### Who can read/write what

There is **no login yet**, so every route is open to anyone who can reach the server. Supabase Auth and Row Level Security used to restrict `users` and `calendar` to the signed-in user. That now has to be built in Express (for example sessions or JWTs, plus `bcrypt` for `users.password_hash`) before the calendar and profile features go live.

### Changing the database

Don't edit tables only in pgAdmin, because teammates won't know. Instead:

1. Write the change as SQL and run it against your local database.
2. Add the same SQL to a new file in `back/db/` (e.g. `003_add_user_likes.sql`), update `back/db/schema.sql` so new setups get it too, and commit both.

Migrations so far (run each once on a database created before it):

| File | What it changes |
| ---- | --------------- |
| `back/db/002_calendar_multiple_dishes.sql` | `calendar` gets a `calendar_id` key, so a meal can hold several dishes; adds Snack (4) and Dessert (5) slots. Step-by-step guide: [`002_calendar_multiple_dishes.md`](back/db/002_calendar_multiple_dishes.md) |
