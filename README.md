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
| `calendar`           | (`user_id`, `date`, `meal_slot`) | Each user's planned meals                                 |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Tech Stack

| Layer    | What we used                                                                        |
| -------- | ----------------------------------------------------------------------------------- |
| Frontend | EJS page templates in `front/views/`, with CSS and JavaScript in `front/public/` |
| API      | Node.js + Express 5 (`back/src/server.js`), called from the browser with `fetch`       |
| Database | PostgreSQL, accessed from the server with `node-postgres` (`pg`)                  |
| Sessions | Redis, through `express-session` + `connect-redis` (`back/src/redis.js`)            |
| Tooling  | Node.js 18.18+ (`npm start`, `npm run db:init`, `npm run check`)                  |

**Why this fits our team:** we started on Supabase's hosted backend, but lost access when the free trial ended. Running our own Express server on top of plain Postgres means nothing depends on a paid service: everyone runs the whole stack locally, the schema is SQL in this repo, and the same code can later point at any hosted Postgres (Render, Neon, Railway, etc.) by changing `DATABASE_URL`.

**How the pieces connect:** the browser never talks to the database. The page calls `/api/...` on the Express server, the server runs SQL against Postgres and sends JSON back. The database password lives only in each teammate's git-ignored `.env` file.

## How to Get It Running

1. **Install Node.js 18.18+ and PostgreSQL.** On Windows, the [PostgreSQL installer](https://www.postgresql.org/download/windows/) includes pgAdmin and `psql`. Remember the password you set for the `postgres` user.
2. **Get Redis running.** Logins are stored in Redis, and the server won't start without it. Pick one:
   - **Mac:** `brew install redis && brew services start redis`. It then starts by itself whenever your Mac boots. Check it with `redis-cli ping` (should print `PONG`).
   - **Windows, or if you'd rather not install anything:** create a free database on [Upstash](https://upstash.com) and copy its Redis URL (starts with `rediss://`). You'll paste it into `.env` in step 5. Teammates can share one.
3. **Create an empty database** named `meal_planner` (in pgAdmin: right-click Databases → Create, or run `createdb -U postgres meal_planner`).
4. **Clone and install:**
   ```bash
   git clone https://github.com/LoganStaub/meal-planner.git
   cd meal-planner
   cd back
   npm install
   ```
5. **Configure:** from `back/`, copy `.env.example` to `.env` and set:
   - `DATABASE_URL`, e.g. `postgres://postgres:YOUR_PASSWORD@localhost:5432/meal_planner`
   - `SESSION_SECRET`, a long random string (the command to make one is in `.env.example`)
   - `REDIS_URL`, only if you're using a hosted Redis. Leave it empty for a local Redis (`redis://localhost:6379`).
6. **Create the tables.** This drops and recreates them, so only run it on a fresh or throwaway database:
   ```bash
   npm run db:init
   ```
7. **Check the connection.** You should see a table of recipe classes (Breakfast, Lunch, …):
   ```bash
   npm run check
   ```
8. **Start the server** and open <http://localhost:3000>:
   ```bash
   npm start        # or: npm run dev  (restarts when you save a file)
   ```
9. **Optional: add test data** for the calendar (user 1 and a few meals this week):
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
| Calendar | `front/views/calendar.ejs`, `front/public/css/calendar.css`, and `front/public/js/calendar.js` | <http://localhost:3000/calendar> (add `?date=YYYY-MM-DD` to open a day) | Week view of the meal plan loaded from `/api/users/1/calendar`; remove a meal. Run `npm run db:seed` for test data |
| Shopping, Search, Recipe, Profile | | `/shopping`, `/search?date=&slot=`, `/recipe?id=` | Not built yet. The calendar already links to these routes |

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
| DELETE | `/api/users/:userId/calendar/:date/:slot`   | Remove one planned meal (`204`, or `404` if that slot is empty)          |

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

### Accounts and passwords

After pulling, run `npm install` and `npm run db:migrate` from `back/`, and make sure Redis is running (step 2 of [How to Get It Running](#how-to-get-it-running)).

Everything is in `back/src/routes/auth.js`. Every page and `/api` route needs a logged-in user, and only admins can change the shared recipe and ingredient lists.

| Page | What it does |
| ---- | ------------ |
| `/signup` | Creates the account and logs the user in right away. No email verification. |
| `/login` | Opening a page while logged out (e.g. `/calendar`) goes to `/login?next=/calendar` and back there after logging in. |
| `/forgot-password` | Emails a one-time reset link that expires in 1 hour. Always shows the same message, so it doesn't reveal which emails have accounts. |
| `/reset-password?token=` | Sets the new password, logs out every device, then logs this one in. |
| `/account/password` | Change password while logged in (linked from the profile menu). Logs out other devices. |

Passwords must be 8 to 72 characters (bcrypt ignores anything past 72 bytes). Without `SMTP_HOST` in `.env`, emails (password resets) are printed in the server console instead of sent.

#### What's stored in Redis

Logins and password reset links are temporary, so they live in Redis instead of Postgres, and Redis deletes them by itself when they expire. The browser only holds a random session id in the `sid` cookie.

| Redis key | What it holds |
| --------- | ------------- |
| `sess:<sid>` | One login, e.g. `{"userId": 42, "cookie": {...}}`. Redis deletes it by itself after 7 days. |
| `user_sessions:<userId>` | The session ids of all of that user's logins, so a password change or reset can log out their other devices. |
| `reset:<tokenHash>` | A password reset link (a hash of its token, never the token itself) and the user it's for. Expires after 1 hour, and is deleted as soon as it's used. |
| `reset_user:<userId>` | That user's current reset link, so only the newest one works and changing the password cancels it. |
| `reset_cooldown:<userId>` | Exists for 60 seconds after a reset email is sent, so a user can get at most one per minute. |

Logging out deletes the session. Restarting the server doesn't log anyone out, but clearing Redis logs everyone out and cancels any reset links. To see the keys locally: `redis-cli --scan --pattern 'sess:*'` (or `'reset*'`).

The old `session`, `pending_signups` and `password_reset_tokens` tables in Postgres aren't used anymore. Migration `005_drop_unused_auth_tables.sql` removes them.

Rate limits are per IP address and kept in memory, so they reset when the server restarts:

| Form | Limit |
| ---- | ----- |
| Login | 10 wrong passwords per 15 minutes |
| Change password | 10 wrong passwords per 15 minutes |
| Forgot password | 5 requests per 15 minutes |
| Signup | 10 per hour |

### Changing the database

Don't edit tables only in pgAdmin, because teammates won't know. Instead:

1. Write the change as SQL and run it against your local database.
2. Add the same SQL to a new file in `back/db/` (e.g. `002_add_user_likes.sql`), update `back/db/schema.sql` so new setups get it too, and commit both.
