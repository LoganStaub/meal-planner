# Meal Planner

## App Summary

Deciding what to eat every day, and making sure the right groceries are in the house, takes more time and mental energy than most people have to spare. Young adults and busy professionals feel this the most: they end up eating out, repeating the same few meals, or buying food that goes to waste. Meal Planner is a meal planning and recipe discovery app built for them. Users browse a short swipe feed of recipes, like the ones they want to keep, and place them on a calendar to build a meal plan. A virtual pantry tracks which ingredients they have at home and how much is left. A shopping list and recipe search round out the app, so planning, shopping, and cooking happen in one place. This repository holds the whole app: the Express server, the PostgreSQL schema, and the pages. Users sign up and log in, and their calendar, pantry and liked recipes are their own.

## ERD

![Entity relationship diagram for Meal Planner](docs/erd.png)

The full schema is `back/db/schema.sql` plus the files in `back/db/migrations/` (`npm run db:init` runs both).

## Folder Structure

```text
front/
  views/                EJS page templates
    partials/           Shared pieces (header, profile menu, phone bottom nav, pantry item)
  public/               Browser assets served by Express
    css/                Stylesheets
    images/             Images served to the frontend
    js/                 Browser JavaScript
back/                  Express server, database code, and SQL
  src/                 Server (server.js), shared helpers (db.js, redis.js, email.js…)
    routes/            Pages and API routes, one file per area
  db/                  PostgreSQL schema (schema.sql)
    migrations/        Numbered changes for existing databases (npm run db:migrate)
  scripts/             Setup, migration and seed scripts (npm run db:…)
docs/                  Project documentation and diagrams
```

Express renders EJS templates from `front/views/` and serves static assets from
`front/public/`. The browser frontend talks to the backend through HTTP requests
to `/api/...` on the same host, so it can use `fetch('/api/ingredients')` without
extra CORS configuration. The browser never connects directly to PostgreSQL.

| Table                  | Key                                    | What it holds                                             |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| `users`              | `user_id`                            | Account: name, email, phone, bcrypt `password_hash`, `role` (user or admin) |
| `recipe_classes`     | `recipe_class_id`                    | Breakfast, Lunch, Dinner…                                |
| `recipes`            | `recipe_id`                          | Title, cost, macros, prep time, instructions, and `created_by`/`created_at` for recipes added with the AI assistant. (The old `liked` column is no longer used; likes are per user in `user_liked_recipes`) |
| `ingredients`        | `ingredient_id`                      | Ingredient name and default measurement. (The old `pantry_amount_id` column is no longer used; pantry amounts are per user in `user_pantry`) |
| `measurements`       | `measure_amount_id`                  | Cup, Tablespoon, Gram…                                   |
| `recipe_ingredients` | (`recipe_id`, `recipe_seq_number`) | Which ingredients go in each recipe, in order             |
| `calendar`           | `calendar_id`                        | Each user's planned dishes. `meal_slot`: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert. A meal can hold several dishes, but not the same recipe twice |
| `user_pantry`        | (`user_id`, `ingredient_id`)         | Each user's own pantry and how much is left               |
| `user_liked_recipes` | (`user_id`, `recipe_id`)             | Which recipes each user liked                             |
| `schema_migrations`  | `filename`                           | Which `back/db/migrations` files this database has already run (managed by `npm run db:migrate`) |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Tech Stack

| Layer    | What we used                                                                        |
| -------- | ----------------------------------------------------------------------------------- |
| Frontend | EJS page templates in `front/views/`, with CSS and JavaScript in `front/public/` |
| API      | Node.js + Express 5 (`back/src/server.js`), called from the browser with `fetch`       |
| Database | PostgreSQL, accessed from the server with `node-postgres` (`pg`)                  |
| Sessions | Redis, through `express-session` + `connect-redis` (`back/src/redis.js`)            |
| Accounts | `bcryptjs` for password hashes, `express-rate-limit` on the login forms, `nodemailer` for password reset emails |
| AI       | Claude through `@anthropic-ai/sdk`, for the "Add a recipe with AI" assistant (`back/src/recipeAssistant.js`) |
| Tooling  | Node.js 22+ (`npm start`, `npm run db:migrate`, `npm run check`)                  |

**Why this fits our team:** we started on Supabase's hosted backend, but lost access when the free trial ended. Running our own Express server on top of plain Postgres means nothing depends on a paid service. The schema is SQL in this repo, and the same code runs against a local Postgres or a hosted one (we share one on Neon) just by changing `DATABASE_URL`.

**How the pieces connect:** the browser never talks to the database. The page calls `/api/...` on the Express server, and the server runs SQL against Postgres and sends JSON back. Postgres holds the lasting data (accounts, recipes, calendars, pantries). Redis holds short-lived data: who is logged in, password reset links, and the AI assistant's drafts and daily counts. Passwords and keys live only in each teammate's git-ignored `back/.env` file.

## How to Get It Running

> **Using the team's shared Neon database?** Skip installing PostgreSQL (step 1) and creating a database (step 3). Put the Neon connection string from a teammate in `DATABASE_URL` (step 5), and in step 6 run `npm run db:migrate` instead of `db:init`.

1. **Install Node.js 22+ and PostgreSQL.** Check your Node version with `node -v`; some packages (`connect-redis`, `redis`, `nodemailer`) won't run on older versions. On Windows, the [PostgreSQL installer](https://www.postgresql.org/download/windows/) includes pgAdmin and `psql`. Remember the password you set for the `postgres` user.
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
   - `REDIS_URL`, only if you're using a hosted Redis. Leave it empty for a local Redis (`redis://localhost:6379`). For Upstash, use the `rediss://…:6379` URL from its **TCP** tab, not the REST URL.
   - `APP_URL`, normally `http://localhost:3000`. Password reset links start with it.
   - `SMTP_HOST` and the other `SMTP_…`/`MAIL_FROM` settings, only if you want real emails. Leave `SMTP_HOST` empty and password reset emails are printed in the server console instead.
   - `ANTHROPIC_API_KEY`, only needed for the Recipes page's "Add a recipe with AI" assistant. Everything else works without it.
   - `APP_TIME_ZONE` is optional (default `America/Denver`). It's when the AI assistant's daily limits reset.
6. **Create the tables.** On a fresh or throwaway database, this creates every table and then runs all the migrations. It **drops existing tables first**, so never run it on a database with data you want to keep (especially not the shared Neon one):
   ```bash
   npm run db:init
   ```
   On a database that already has tables, run `npm run db:migrate` instead. It only applies the migrations that database hasn't had yet.
7. **Check the connection.** You should see a table of recipe classes (Breakfast, Lunch, …):
   ```bash
   npm run check
   ```
8. **Start the server** and open <http://localhost:3000>. You'll land on the login page; click **Sign up** to make an account (no email confirmation needed).
   ```bash
   npm start        # or: npm run dev  (restarts when you save a file or .env)
   ```
9. **Optional: add test data.**
   ```bash
   npm run db:seed-recipes   # 5 complete recipes with ingredients (the same 5 meals the home page shows)
   npm run db:seed           # a test user (user_id 1) with a few meals planned this week
   ```
   The `db:seed` test user has no password, so nobody can log in as it, and its meals won't show on your own calendar. To fill your calendar, add meals from the Recipes or Home page while logged in.
10. **Optional: make yourself an admin** so you can add and edit the shared recipe and ingredient lists through the API:
    ```bash
    npm run user:role -- you@example.com admin
    ```

> Opening the pages by double-clicking them doesn't work. Pages have to be loaded from the server, which checks who's logged in and handles their `/api` calls.

## Pages

| Page    | File                             | URL                                  | Status                                                    |
| ------- | -------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Home    | `front/views/index.ejs` with `front/public/css/index.css` and `front/public/js/index.js` | <http://localhost:3000/home> (`/` sends you here once logged in) | Swipe through 5 meals and open a recipe popup. **Like** saves to `/api/me/likes` and **Add to calendar** picks a day and meal and saves to `/api/me/calendar`. The 5 meals and photos are still placeholder data in `index.js` (`SAMPLE_MEALS`); `npm run db:seed-recipes` adds matching recipes so likes and calendar entries point at real rows. The "… picks" label follows the time of day |
| Pantry  | `front/views/pantry.ejs`, `front/public/css/pantry.css`, `front/public/js/pantry.js`, and `front/public/images/pantry-banner.jpeg` | <http://localhost:3000/pantry> or <http://localhost:3000/pantry.html> | The logged-in user's own pantry (`user_pantry`), sorted by inventory level (Plenty left to None); search locally; add with a starting inventory amount, rename, update status, and delete through `/api/me/pantry` |
| Liked recipes | `front/views/liked.ejs`, `front/public/css/liked.css`, and `front/public/images/recipes-header.webp` | <http://localhost:3000/liked> or <http://localhost:3000/liked.html> | Lists the recipes the logged-in user liked (`user_liked_recipes`) and counts their ingredients against that user's pantry |
| Calendar | `front/views/calendar.ejs`, `front/public/css/calendar.css`, and `front/public/js/calendar.js` | <http://localhost:3000/calendar> (add `?date=YYYY-MM-DD` to open a day) | Week view of the logged-in user's meal plan, loaded from `/api/me/calendar`. Breakfast, Lunch and Dinner each list their dishes ("+ Add another" for more), with a Snacks & desserts group below; remove one dish at a time. Run `npm run db:seed` for test data |
| Recipes (was Search) | `front/views/search.ejs`, `front/public/css/search.css` (on top of `calendar.css`), `front/public/js/search.js`, and `back/src/routes/search.js` | <http://localhost:3000/recipes> (`?q=chicken&filter=dinner`). Old `/search` links redirect here, keeping their query | The place to find, add and save recipes. The file names still say `search`. Searches recipe names and ingredients; filters for meal type, Quick Meals (prep ≤ 30 min) and High Protein (≥ 25g, read from the `macros` text). Thresholds are constants at the top of `routes/search.js`. From a calendar + button (`?date=YYYY-MM-DD&slot=1-5`) it shows an "Adding to…" banner with an Add to calendar button (X keeps searching without adding). A meal's own button (e.g. "+ Add breakfast") starts on that meal's filter; the general + starts unfiltered (`filter=` empty). The **Add a recipe with AI** button (`front/public/js/recipe-add.js`, `front/public/css/recipe-add.css`) needs `ANTHROPIC_API_KEY` |
| Shopping | `front/views/shopping.ejs`, `front/public/css/shopping.css` (on top of `pantry.css`), and `front/public/js/shopping.js` | <http://localhost:3000/shopping> | One column on phones; on computers the weekly summary and add box sit on the left with the list on the right. Sample items hard-coded in `back/src/server.js`; not connected to the calendar or pantry yet |
| Login and account | `front/views/login.ejs`, `signup.ejs`, `forgot-password.ejs`, `reset-password.ejs`, `change-password.ejs`, with `front/public/css/auth.css` | `/login`, `/signup`, … | See [Accounts and passwords](#accounts-and-passwords) |
| Recipe | | `/recipe?id=` | Not built yet. The Calendar and Recipes pages already link to it |

The home page's recipe details popup is the `<dialog id="recipe-details">` in `front/views/index.ejs`. Its content goes in `#details-body`, and the open recipe's ID is in `dialog.dataset.recipeId`.

**Navigation:** every page has the same navigation: a bottom bar on phones and tablets, and a left sidebar from 1024px wide (Home first, then Calendar, Shopping, Recipes, Pantry). Home, Calendar and Recipes build it into their own layout (`.nav` in `index.css` / `calendar.css`). Shopping, Pantry and Liked include `front/views/partials/site-nav.ejs` with `front/public/css/site-nav.css`, which copies that look exactly; those pages need `class="has-site-nav"` on `<body>`. Pass `active: 'pantry'` (etc.) when rendering to highlight the current page. Every page also shares one top bar, `front/views/partials/page-header.ejs` with `front/public/css/page-header.css`: the page title in the middle and the account circle in the top-right corner, which opens the profile menu. Include it with `include('partials/page-header', { pageTitle: 'Pantry' })`. It's the only place the bar and the circle are styled, so don't restyle them in a page's own CSS. The app is called **Meal Planner** everywhere, and tab titles follow `Page | Meal Planner`.

## Verifying the Vertical Slice

The vertical slice is **adding an ingredient to your Virtual Pantry**.

1. From `back/`, run `npm start`, log in, and open <http://localhost:3000/pantry>. Your pantry loads from the database under **Your ingredients**.
2. Type an ingredient name (for example, `Beans`) into the **Add an item** box, and pick a **Starting inventory** (Plenty left, Running low or None).
3. Click **Add**. The page sends `POST /api/me/pantry`. The server reuses the ingredient if one with that name exists (or creates it in `ingredients`), adds it to your `user_pantry`, and returns it. It then appears in the list, sorted by inventory level.
4. Refresh the page (F5). The ingredient is still in the list, because the page reloads everything from the database.
5. Optional: run `select * from user_pantry;` in pgAdmin or `psql` to see the new row with your `user_id`.

## API Reference

All routes return JSON and need a logged-in user (they answer `401` otherwise). Errors look like `{ "error": "message" }`.

**Shared data.** Everyone can read it; only admins can change it (`npm run user:role` makes someone an admin).

| Method | Route | What it does |
| ------ | ----- | ------------ |
| GET    | `/api/ingredients` | All ingredients |
| POST   | `/api/ingredients` | Admin: add one: `{ ingredient_name, pantry_amount_id? }` |
| PATCH  | `/api/ingredients/:id` | Admin: change `ingredient_name`, `pantry_amount_id`, and/or `measure_amount_id` |
| DELETE | `/api/ingredients/:id` | Admin: delete one (fails with 400 if a recipe uses it) |
| GET    | `/api/recipes` | All recipes with their class name |
| GET    | `/api/recipes/:id` | One recipe with its ordered ingredient list |
| POST   | `/api/recipes` | Admin: add one: `{ recipe_title, recipe_class_id?, cost?, prep_time?, macros?, instructions? }` |
| GET    | `/api/recipe-classes` | Breakfast, Lunch, … |
| GET    | `/api/measurements` | Cup, Tablespoon, … |

**The logged-in user's own data.** The user comes from the login session, never from the URL, so nobody can read or change someone else's data.

| Method | Route | What it does |
| ------ | ----- | ------------ |
| GET    | `/api/me/calendar?start=…&end=…` | Planned dishes between two `YYYY-MM-DD` dates, each with its `calendar_id` |
| POST   | `/api/me/calendar` | Add a dish: `{ date, meal_slot (1-5), recipe_id, allow_duplicate? }` (`201`). If the recipe is already planned that day: `409` with `code: 'already_planned'` and `meal_slots`; resend with `allow_duplicate: true` to add it to a different meal anyway |
| DELETE | `/api/me/calendar/:calendarId` | Remove one planned dish (`204`, or `404` if it's not on your calendar) |
| GET    | `/api/me/likes` | Ids of the recipes you liked |
| PUT    | `/api/me/likes/:recipeId` | Like a recipe (`204`) |
| DELETE | `/api/me/likes/:recipeId` | Unlike it (`204`) |
| GET    | `/api/me/pantry` | Your pantry items |
| POST   | `/api/me/pantry` | Add one: `{ ingredient_name, pantry_amount_id? }` (`201`) |
| PATCH  | `/api/me/pantry/:ingredientId` | Change `ingredient_name` and/or `pantry_amount_id` |
| DELETE | `/api/me/pantry/:ingredientId` | Remove one (`204`) |

**"Add a recipe with AI" assistant** (Recipes page). Any logged-in user can add recipes to the shared list this way, because Claude checks each one first. Each user can save 3 recipes and run 5 AI checks per day, resetting at midnight in `APP_TIME_ZONE` (`back/src/recipeAddLimit.js`). Saved recipes record who added them in `recipes.created_by` and `created_at` (migration 007). Checked drafts wait in Redis for 30 minutes. Needs `ANTHROPIC_API_KEY` in `.env`.

| Method | Route | What it does |
| ------ | ----- | ------------ |
| GET    | `/api/recipe-assistant/status` | How many recipes and checks you have left today |
| POST   | `/api/recipe-assistant/check` | `{ text }`: Claude turns it into a recipe draft, or explains why not |
| POST   | `/api/recipe-assistant/drafts/:draftId/save` | Save a checked draft to `recipes` (`201`) |

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
| `POST /logout` | Logs out this browser (the profile menu's Log out button). |

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
| `recipe_draft:<draftId>` | A recipe the AI assistant checked, waiting to be saved. Expires after 30 minutes. |
| `recipe_checks:<date>:<userId>` | How many AI checks that user has run today (limit 5). |

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

1. Add a new numbered file to `back/db/migrations/` (next is `008_...sql`). Write it so it's safe to run more than once (`if not exists`, or check first like `006` does).
2. Update `back/db/schema.sql` so brand-new setups get the change too.
3. Run `npm run db:migrate` to apply it, and commit both files.

Teammates then run `npm run db:migrate` after pulling. It only runs the files their database hasn't had yet (they're recorded in the `schema_migrations` table) and never drops data. **Never run `npm run db:init` against the shared Neon database:** it drops and recreates every table.

| Migration | What it changes |
| --------- | --------------- |
| `001_user_data.sql` | Per-user `user_pantry` and `user_liked_recipes`, and `users.role` (user or admin) |
| `002_email_verification.sql`, `003_pending_signups.sql`, `004_password_reset.sql` | Email verification and reset tables. No longer used; `005` removes them |
| `005_drop_unused_auth_tables.sql` | Drops `pending_signups`, `session` and `password_reset_tokens` (that data lives in Redis now) |
| `006_calendar_multiple_dishes.sql` | `calendar` gets a `calendar_id` key, so a meal can hold several dishes; adds Snack (4) and Dessert (5) slots. Guide: [`calendar_multiple_dishes.md`](back/db/calendar_multiple_dishes.md) |
| `007_recipe_created_by.sql` | `recipes.created_by` and `created_at`, so the AI assistant can record who added a recipe and limit each user to 3 a day |
