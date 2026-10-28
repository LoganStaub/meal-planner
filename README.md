# Meal Planner

## App Summary

Deciding what to eat every day, and making sure the right groceries are in the house, takes more time and mental energy than most people have to spare. Young adults and busy professionals feel this the most: they end up eating out, repeating the same few meals, or buying food that goes to waste. Meal Planner is a meal planning and recipe discovery app built for them. Users browse a short swipe feed of recipes, like the ones they want to keep, and place them on a calendar to build a meal plan. A virtual pantry tracks which ingredients they have at home and how much is left. A shopping list and recipe search round out the app, so planning, shopping, and cooking happen in one place. This repository holds the database and the first working feature, the Virtual Pantry.

## ERD

![Entity relationship diagram for Meal Planner](docs/erd.png)

The full schema lives in `db/schema.sql`.

| Table                  | Key                                    | What it holds                                             |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| `users`              | `user_id`                            | Profile info; `password_hash` is reserved for login     |
| `recipe_classes`     | `recipe_class_id`                    | Breakfast, Lunch, Dinner…                                |
| `recipes`            | `recipe_id`                          | Title, cost, macros, prep time, instructions, liked       |
| `ingredients`        | `ingredient_id`                      | Ingredient name, pantry amount, default measurement       |
| `measurements`       | `measure_amount_id`                  | Cup, Tablespoon, Gram…                                   |
| `recipe_ingredients` | (`recipe_id`, `recipe_seq_number`) | Which ingredients go in each recipe, in order             |
| `calendar`           | (`user_id`, `date`, `meal_slot`) | Each user's planned meals                                 |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Tech Stack

| Layer    | What we used                                                                        |
| -------- | ----------------------------------------------------------------------------------- |
| Frontend | Plain HTML, CSS, and JavaScript in a single page (`mp-vertical-slice/index.html`) |
| API      | Node.js + Express 5 (`src/server.js`), called from the browser with `fetch`       |
| Database | PostgreSQL, accessed from the server with `node-postgres` (`pg`)                  |
| Tooling  | Node.js 18.18+ (`npm start`, `npm run db:init`, `npm run check`)                  |

**Why this fits our team:** we started on Supabase's hosted backend, but lost access when the free trial ended. Running our own Express server on top of plain Postgres means nothing depends on a paid service: everyone runs the whole stack locally, the schema is SQL in this repo, and the same code can later point at any hosted Postgres (Render, Neon, Railway, etc.) by changing `DATABASE_URL`.

**How the pieces connect:** the browser never talks to the database. The page calls `/api/...` on the Express server, the server runs SQL against Postgres and sends JSON back. The database password lives only in each teammate's git-ignored `.env` file.

## How to Get It Running

1. **Install Node.js 18.18+ and PostgreSQL.** On Windows, the [PostgreSQL installer](https://www.postgresql.org/download/windows/) includes pgAdmin and `psql`. Remember the password you set for the `postgres` user.
2. **Create an empty database** named `meal_planner` (in pgAdmin: right-click Databases → Create, or run `createdb -U postgres meal_planner`).
3. **Clone and install:**
   ```bash
   git clone https://github.com/LoganStaub/meal-planner-backend.git
   cd meal-planner-backend
   npm install
   ```
4. **Configure:** copy `.env.example` to `.env` and set `DATABASE_URL`, e.g. `postgres://postgres:YOUR_PASSWORD@localhost:5432/meal_planner`.
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

> Opening `index.html` by double-clicking it no longer works. The page has to be loaded from the server so its `/api` calls reach Express.

## Verifying the Vertical Slice

The vertical slice is **adding an ingredient to the Virtual Pantry**.

1. Run `npm start` and open <http://localhost:3000>. The existing ingredients load from the database under **My Ingredients**.
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

Routes live in `src/routes/`, one file per area. Use the shared pool from `src/db.js` and **always pass values as `$1, $2…` parameters**, never by pasting them into the SQL string:

```js
const { rows } = await pool.query('select * from recipes where recipe_id = $1', [req.params.id])
```

Then mount the router in `src/server.js`.

### Who can read/write what

There is **no login yet**, so every route is open to anyone who can reach the server. Supabase Auth and Row Level Security used to restrict `users` and `calendar` to the signed-in user. That now has to be built in Express (for example sessions or JWTs, plus `bcrypt` for `users.password_hash`) before the calendar and profile features go live.

### Changing the database

Don't edit tables only in pgAdmin, because teammates won't know. Instead:

1. Write the change as SQL and run it against your local database.
2. Add the same SQL to a new file in `db/` (e.g. `002_add_user_likes.sql`), update `db/schema.sql` so new setups get it too, and commit both.
