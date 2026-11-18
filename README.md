# Preply

## App Summary

Deciding what to eat every day, and making sure the right groceries are in the house, takes more time and mental energy than most people have to spare. Young adults and busy professionals feel this the most: they end up eating out, repeating the same few meals, or buying food that goes to waste. Preply is a meal planning and recipe discovery app built for them. Users browse a short swipe feed of recipes, like the ones they want to keep, and place them on a calendar to build a meal plan. A virtual pantry tracks which ingredients they have at home and how much is left. A shopping list and recipe search round out the app, so planning, shopping, and cooking happen in one place. This repository holds the whole app: the Express server, the PostgreSQL schema, and the pages. Users sign up and log in, and their calendar, pantry and liked recipes are their own.

## ERD

![Entity relationship diagram for Preply](docs/Meal_Planner_ERD.png)

The full schema is `back/db/schema.sql` plus the files in `back/db/migrations/` (`npm run db:init` runs both).

## Folder Structure

```text
front/
  views/                EJS page templates
    partials/           Shared pieces (top bar, sidebar/bottom nav, profile menu, pantry item)
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

| Table                   | Key                                    | What it holds                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`               | `user_id`                            | Account: name, email, phone, bcrypt `password_hash`, `role` (user or admin)                                                                                                                                     |
| `recipe_classes`      | `recipe_class_id`                    | Breakfast, Lunch, Dinner…                                                                                                                                                                                          |
| `recipes`             | `recipe_id`                          | Title, cost, macros, prep time, instructions, `image_path` (the recipe's photo, shown on Home), and `created_by`/`created_at` for recipes added with the AI assistant. (The old `liked` column is no longer used; likes are per user in `user_liked_recipes`) |
| `ingredients`         | `ingredient_id`                      | Ingredient name and default measurement. (The old `pantry_amount_id` column is no longer used; pantry amounts are per user in `user_pantry`)                                                                    |
| `measurements`        | `measure_amount_id`                  | Cup, Tablespoon, Gram…                                                                                                                                                                                             |
| `recipe_ingredients`  | (`recipe_id`, `recipe_seq_number`) | Which ingredients go in each recipe, in order                                                                                                                                                                       |
| `calendar`            | `calendar_id`                        | Each user's planned dishes. `meal_slot`: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert. A meal can hold several dishes, but not the same recipe twice                                                        |
| `user_pantry`         | (`user_id`, `ingredient_id`)       | Each user's own pantry and how much is left                                                                                                                                                                         |
| `user_liked_recipes`  | (`user_id`, `recipe_id`)           | Which recipes each user liked                                                                                                                                                                                       |
| `user_recipe_ratings` | (`user_id`, `recipe_id`)           | Each user's 1–5 star rating. Private: the API only returns a user's own ratings                                                                                                                                    |
| `recipe_rating_stats` | `recipe_id`                          | Each recipe's anonymous rating totals (sum, count, average), kept in sync by a trigger                                                                                                                              |
| `schema_migrations`   | `filename`                           | Which `back/db/migrations` files this database has already run (managed by `npm run db:migrate`)                                                                                                                |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Tech Stack

| Layer    | What we used                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| Frontend | EJS page templates in `front/views/`, with CSS and JavaScript in `front/public/`                                  |
| API      | Node.js + Express 5 (`back/src/server.js`), called from the browser with `fetch`                                  |
| Database | PostgreSQL, accessed from the server with `node-postgres` (`pg`)                                                  |
| Sessions | Redis, through `express-session` + `connect-redis` (`back/src/redis.js`)                                        |
| Accounts | `bcryptjs` for password hashes, `express-rate-limit` on the login forms, `nodemailer` for password reset emails |
| AI       | Claude through `@anthropic-ai/sdk`, for the "Add a recipe with AI" assistant (`back/src/recipeAssistant.js`)      |
| Tooling  | Node.js 22+ (`npm start`, `npm run db:migrate`, `npm run check`)                                                |

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
   - `APP_TIME_ZONE` is optional (default `America/Denver`). It decides when "today" starts: the AI assistant's daily limits, the Home page's daily picks, the shopping list's week, and the day a planned recipe can be rated.
   - `OKR_TRACKING_START` is optional. The admin page only counts users who signed up after it (see `.env.example`).
6. **Create the tables.** On a fresh or throwaway database, this creates every table and then runs all the migrations. It **drops existing tables first**, so never run it on a database with data you want to keep (especially not the shared Neon one):
   ```bash
   npm run db:init
   ```

   On a database that already has tables, run `npm run db:migrate` instead. It only applies the migrations that database hasn't had yet.
7. **Check the connection.** You should see a table of recipe classes (Breakfast, Lunch, …):
   ```bash
   npm run check
   ```
8. **Start the server** and open [http://localhost:3000](http://localhost:3000). You'll land on the login page; click **Sign up** to make an account (no email confirmation needed).
   ```bash
   npm start        # or: npm run dev  (restarts when you save a file or .env)
   ```
9. **Optional: add test data.**
   ```bash
   npm run db:seed-recipes   # 5 complete recipes with ingredients
   npm run db:seed-classics  # 5 real recipes, one per meal type (sources in scripts/seedClassicRecipes.js)
   npm run db:seed           # a test user (user_id 1) with a few meals planned this week
   ```

   The `db:seed` test user has no password, so nobody can log in as it, and its meals won't show on your own calendar. To fill your calendar, add meals from the Recipes or Home page while logged in.
10. **Optional: make yourself an admin** so you can add and edit the shared recipe and ingredient lists through the API:
    ```bash
    npm run user:role -- you@example.com admin
    ```

> Opening the pages by double-clicking them doesn't work. Pages have to be loaded from the server, which checks who's logged in and handles their `/api` calls.

## Pages

| Page                 | File                                                                                                                                                       | URL                                                                                                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                 | `front/views/index.ejs` with `front/public/css/index.css` and `front/public/js/index.js` | [http://localhost:3000/home](http://localhost:3000/home) (`/` sends you here once logged in) | Swipe through 5 daily picks from `/api/me/daily-picks` (`back/src/routes/dailyPicks.js`). Each user gets their own 5, the same all day and new at midnight in `APP_TIME_ZONE`; recipes liked on an earlier day are skipped. The photo is `recipes.image_path` (a plain background when it's empty) and the description lists the first few ingredients. The **In pantry** line compares the recipe with the user's own pantry. Clicking the title or the In pantry line opens the recipe page. **Like** saves to `/api/me/likes` and **Add to meal plan** picks a day and meal. Each card shows the recipe's average rating, e.g. "★ 4.3 (12)". The "… picks" label follows the time of day |
| Pantry               | `front/views/pantry.ejs`, `front/public/css/pantry.css`, `front/public/js/pantry.js`, and `front/public/images/pantry-banner.jpeg`                 | [http://localhost:3000/pantry](http://localhost:3000/pantry) or [http://localhost:3000/pantry.html](http://localhost:3000/pantry.html)                   | The logged-in user's own pantry (`user_pantry`), sorted by inventory level (Plenty left to None); search locally and filter by amount (All, Plenty left, Running low, None); new ingredients always start as Plenty left. One **Edit** button puts the whole list in edit mode: click an amount to change it, or tick ingredients and use "Set to" or Delete for several at once; nothing is saved until **Save changes** (Cancel puts it all back). Everything goes through `/api/me/pantry`                                                                                                                                                                                                                               |
| Liked recipes        | `front/views/liked.ejs`, `front/public/css/liked.css`, and `front/public/images/mealio-liked-header-v2.jpg` | [http://localhost:3000/liked](http://localhost:3000/liked) or [http://localhost:3000/liked.html](http://localhost:3000/liked.html) | Small cards for the recipes the logged-in user liked (`user_liked_recipes`): photo space, time, meal type, title, star rating, and how many ingredients are in their pantry. Clicking a card opens the recipe page. See [Recipe ratings](#recipe-ratings) |
| Meal Plan (Calendar) | `front/views/calendar.ejs`, `front/public/css/calendar.css`, and `front/public/js/calendar.js`                                                       | [http://localhost:3000/calendar](http://localhost:3000/calendar) (add `?date=YYYY-MM-DD` to open a day)                                               | Called **Meal Plan** everywhere in the app; the URL, files and API still say calendar. Week view of the logged-in user's meal plan, loaded from `/api/me/calendar`. The open day is kept in the address (`?date=`), so coming back from a recipe returns to the same day. Breakfast, Lunch and Dinner each list their dishes ("+ Add another" for more), with a Snacks & desserts group below; remove one dish at a time. Run `npm run db:seed` for test data                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Recipes (was Search) | `front/views/search.ejs`, `front/public/css/search.css` (on top of `calendar.css`), `front/public/js/search.js`, and `back/src/routes/search.js` | [http://localhost:3000/recipes](http://localhost:3000/recipes) (`?q=chicken&filter=dinner`). Old `/search` links redirect here, keeping their query | The place to find, add and save recipes. The file names still say `search`. Searches recipe names and ingredients; filters for meal type, Quick Meals (prep ≤ 30 min) and High Protein (≥ 25g, read from the `macros` text). Thresholds are constants at the top of `routes/search.js`. Clicking a recipe opens its recipe page. From a Meal Plan + button (`?date=YYYY-MM-DD&slot=1-5`) it shows an "Adding to…" banner, and the recipe page then starts **Add to meal plan** on that day and meal (X keeps searching without adding). A meal's own button (e.g. "+ Add breakfast") starts on that meal's filter; the general + starts unfiltered (`filter=` empty). The **Add a recipe with AI** button (`front/public/js/recipe-add.js`, `front/public/css/recipe-add.css`) needs `ANTHROPIC_API_KEY` |
| Shopping             | `front/views/shopping.ejs`, `front/public/css/shopping.css` (on top of `pantry.css`), and `front/public/js/shopping.js`                            | [http://localhost:3000/shopping](http://localhost:3000/shopping)                                                                                        | Built from the next 7 days of the meal plan, minus the pantry (`back/src/routes/shopping.js`). Ticking an item puts it in the pantry. **Edit** shows a checkbox on each item: tick some (or Select all), press **Remove**, and confirm in the "Remove N items?" popup. Removed items are saved per planned dish in `user_shopping_removed` (migration `014`), so they come back only if you plan another dish that needs them. Items typed into "Add something else" stay on the page only. One column on phones; on computers the weekly summary and add box sit on the left with the list on the right                                                                                                                  |
| Login and account    | `front/views/login.ejs`, `signup.ejs`, `forgot-password.ejs`, `reset-password.ejs`, `change-password.ejs`, with `front/public/css/auth.css`    | `/login`, `/signup`, …                                                                                                                            | See [Accounts and passwords](#accounts-and-passwords)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Recipe page          | `front/views/recipe.ejs`, `front/public/css/recipe-page.css`, `front/public/js/recipe-page.js`, `back/src/recipeView.js`, and `GET /recipes/:id` in `back/src/routes/search.js` | [http://localhost:3000/recipes/3](http://localhost:3000/recipes/3). Old `/recipe?id=3` and `/recipes?recipe=3` links redirect here | Everything about one recipe on its own page: meal type, time, servings, cost, macros, ingredients (each marked In pantry, Running low or To buy from the user's own pantry), numbered steps, and who added it. **Add to meal plan**, **Like**, and your star rating (see [Recipe ratings](#recipe-ratings)). On computers the ingredients stay in view while you scroll the steps. **Keep screen on** stops the screen turning off while cooking (Screen Wake Lock; hidden in browsers without it). The back link returns to the page you came from (Recipes, Home, Meal Plan with its day, or Liked) |
| Admin                | `front/views/admin.ejs`, `admin-okr.ejs`, `admin-denied.ejs`, `front/public/css/admin.css`, and `back/src/routes/admin.js` | [http://localhost:3000/admin](http://localhost:3000/admin), also linked from the profile menu for admins | A dashboard of the 4 OKRs, each Passing, Failing or Not enough data; click one for its breakdown (`/admin/okrs/:number`). The SQL is in `back/db/queries/`. Only admins can open it (`npm run user:role -- you@example.com admin`); everyone else gets a "not authorized" page with a way back to Home |

To link to a recipe, use `/recipes/<recipe id>`. The **Add to meal plan** popup is shared by Home and the recipe page: include `partials/plan-dialog` with `front/public/js/plan-dialog.js` and `front/public/css/plan-dialog.css`, then call `PlanDialog.open(recipe, { entryPoint })`. Servings and the four macro numbers are read out of the `recipes.macros` text (`back/src/recipeView.js`). The star rating is also shared: `include('partials/star-rating', { ... })` with `front/public/js/star-rating.js` and `front/public/css/star-rating.css`.

### Shared layout

Every page is built from the same pieces, so they look and behave the same. Each piece is styled in exactly one stylesheet; don't restyle it in a page's own CSS.

| Piece        | Files                                                                                                                                                                       | Notes                                                                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation   | `.nav` in `index.css` / `calendar.css` (Home, Calendar, Recipes); `front/views/partials/site-nav.ejs` + `front/public/css/site-nav.css` (Shopping, Pantry, Liked) | Bottom bar on phones and tablets, left sidebar from 1024px wide (Home first, then Calendar, Shopping, Recipes, Pantry). `site-nav` copies the other look exactly; pages using it need `class="has-site-nav"` on `<body>`. Pass `active: 'pantry'` (etc.) when rendering to highlight the current page |
| Top bar      | `front/views/partials/page-header.ejs` + `front/public/css/page-header.css`                                                                                             | Page title in the middle, account circle in the top-right corner (72px tall). `include('partials/page-header', { pageTitle: 'Pantry' })`                                                                                                                                                                    |
| Profile menu | `front/views/partials/profile-menu.ejs` + `front/public/js/profile-menu.js` + `front/public/css/profile-menu.css`                                                     | Opened by the account circle, on every page including Home. A page with the top bar needs all three                                                                                                                                                                                                           |
| Page card    | `front/public/css/page-card.css`                                                                                                                                          | The big rounded card around Home's photo, the Pantry and Liked recipes (`class="page-card"`). Edge to edge on phones; on computers 16px from the top bar and edges with rounded corners. Load it after the page's own stylesheet                                                                            |

**Name and colors:** the app is called **Preply** everywhere, and tab titles follow `Page | Preply`. The accent color is `#D4552A`, with `#BC4720` for hover and `#FCDCCD` as its light tint. Use those three for anything orange.

## Verifying the Vertical Slice

The vertical slice is **adding an ingredient to your Virtual Pantry**.

1. From `back/`, run `npm start`, log in, and open [http://localhost:3000/pantry](http://localhost:3000/pantry). Your pantry loads from the database under **Your ingredients**.
2. Type an ingredient name (for example, `Beans`) into the **Add an item** box, and pick a **Starting inventory** (Plenty left, Running low or None).
3. Click **Add**. The page sends `POST /api/me/pantry`. The server reuses the ingredient if one with that name exists (or creates it in `ingredients`), adds it to your `user_pantry`, and returns it. It then appears in the list, sorted by inventory level.
4. Refresh the page (F5). The ingredient is still in the list, because the page reloads everything from the database.
5. Optional: run `select * from user_pantry;` in pgAdmin or `psql` to see the new row with your `user_id`.

## API Reference

All routes return JSON and need a logged-in user (they answer `401` otherwise). Errors look like `{ "error": "message" }`.

**Shared data.** Everyone can read it; only admins can change it (`npm run user:role` makes someone an admin).

| Method | Route                    | What it does                                                                                                                                                        |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/ingredients`     | All ingredients                                                                                                                                                     |
| POST   | `/api/ingredients`     | Admin: add one: `{ ingredient_name, pantry_amount_id? }`                                                                                                          |
| PATCH  | `/api/ingredients/:id` | Admin: change `ingredient_name`, `pantry_amount_id`, and/or `measure_amount_id`                                                                               |
| DELETE | `/api/ingredients/:id` | Admin: delete one (fails with 400 if a recipe uses it)                                                                                                              |
| GET    | `/api/recipes`         | All recipes with their class name, your like, the rating fields (`rating_avg`, `rating_count`, and your own `my_rating`, `null` if you haven't rated it), and your pantry match: `ingredient_count`, `in_pantry` (names of the ones you have) and `to_buy` |
| GET    | `/api/recipes/:id`     | One recipe with its ordered ingredient list, meal type, your like, who added it, your pantry status for each ingredient, the same rating fields, and `can_rate` / `rate_from` (see [Recipe ratings](#recipe-ratings)) |
| POST   | `/api/recipes`         | Admin: add one: `{ recipe_title, recipe_class_id?, cost?, prep_time?, macros?, instructions? }`                                                                   |
| GET    | `/api/recipe-classes`  | Breakfast, Lunch, …                                                                                                                                                |
| GET    | `/api/measurements`    | Cup, Tablespoon, …                                                                                                                                                 |

**The logged-in user's own data.** The user comes from the login session, never from the URL, so nobody can read or change someone else's data.

| Method | Route                                         | What it does                                                                                                                                                                                                                                                         |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/me/calendar?start=…&end=…`          | Planned dishes between two `YYYY-MM-DD` dates, each with its `calendar_id`                                                                                                                                                                                       |
| POST   | `/api/me/calendar`                          | Add a dish: `{ date, meal_slot (1-5), recipe_id, allow_duplicate? }` (`201`). If the recipe is already planned that day: `409` with `code: 'already_planned'` and `meal_slots`; resend with `allow_duplicate: true` to add it to a different meal anyway |
| DELETE | `/api/me/calendar/:calendarId`              | Remove one planned dish (`204`, or `404` if it's not on your calendar)                                                                                                                                                                                           |
| GET    | `/api/me/daily-picks`                       | Today's 5 Home page recipes for you, with photo, description, rating and pantry match. See the Home row in [Pages](#pages) |
| GET    | `/api/me/likes`                             | Ids of the recipes you liked                                                                                                                                                                                                                                         |
| PUT    | `/api/me/likes/:recipeId`                   | Like a recipe (`204`)                                                                                                                                                                                                                                              |
| DELETE | `/api/me/likes/:recipeId`                   | Unlike it (`204`)                                                                                                                                                                                                                                                  |
| GET    | `/api/me/ratings`                           | Your own ratings: `{ "<recipe_id>": rating, … }`                                                                                                                                                                                                                  |
| PUT    | `/api/me/ratings/:recipeId`                 | Rate a recipe: `{ rating }` (a whole number 1–5). Rating again changes it. Returns `{ recipe_id, my_rating, average, count }`. `400` for a bad rating, `403` if the recipe hasn't been on your meal plan yet, `404` if the recipe doesn't exist                                                                    |
| DELETE | `/api/me/ratings/:recipeId`                 | Remove your rating. Returns the same shape with `my_rating: null`                                                                                                                                                                                                  |
| POST   | `/api/me/onboarding`                        | Save how the first-visit tour went: `{ status }`, one of `skipped`, `started`, `completed` (`204`). See [Onboarding tour](#onboarding-tour)                                                                                                                 |
| GET    | `/api/me/onboarding/dinner?date=YYYY-MM-DD` | For the tour: `{ planned, suggestions }`, that day's dinner (or `null`) and up to 8 suggested dinner recipes                                                                                                                                                     |
| POST   | `/api/me/onboarding/dinner`                 | For the tour: add `{ date, recipe_id }` as that day's dinner (`201`). `409` if the day already has one. Not counted in the OKRs                                                                                                                                |
| GET    | `/api/me/pantry`                            | Your pantry items                                                                                                                                                                                                                                                    |
| POST   | `/api/me/pantry`                            | Add one: `{ ingredient_name, pantry_amount_id? }` (`201`)                                                                                                                                                                                                        |
| PATCH  | `/api/me/pantry/:ingredientId`              | Change `ingredient_name` and/or `pantry_amount_id`                                                                                                                                                                                                               |
| DELETE | `/api/me/pantry/:ingredientId`              | Remove one (`204`)                                                                                                                                                                                                                                                 |
| GET    | `/api/me/shopping`                          | Your shopping list: `[{ ingredient_id, name, forRecipe, amount }]`                                                                                                                                                                                                 |
| PUT    | `/api/me/shopping/:ingredientId/got`        | Tick (`{ got: true }`, adds it to your pantry as Plenty left) or untick (`{ got: false }`, sets it to None) (`204`)                                                                                                                                            |
| POST   | `/api/me/shopping/remove`                   | Take items off your list: `{ ingredient_ids: [...] }` (`204`). Saved for each planned dish that needs them; the pantry isn't touched                                                                                                                             |
| POST   | `/api/events`                               | Log something the user did, for the OKRs: `{ event_name, metadata? }` (`204`). Only names in `CLIENT_EVENTS` (`back/src/events.js`) are accepted; `metadata` is a small object. Server code logs with `logEvent()` from the same file |

**"Add a recipe with AI" assistant** (Recipes page). Any logged-in user can add recipes to the shared list this way, because Claude checks each one first. Each user can save 3 recipes and run 5 AI checks per day, resetting at midnight in `APP_TIME_ZONE` (`back/src/recipeAddLimit.js`). Saved recipes record who added them in `recipes.created_by` and `created_at` (migration 007). Checked drafts wait in Redis for 30 minutes. Claude is given the names in `ingredients` and reuses them, so a recipe that says "parmesan cheese" links to the existing "Parmesan" instead of adding a near-duplicate. In the preview the user can correct the name, meal type, time, cost and ingredients without another AI check; the server re-checks those fields in code (`applyRecipeEdits`), and the steps always stay as Claude checked them. Needs `ANTHROPIC_API_KEY` in `.env`.

| Method | Route                                          | What it does                                                                                                                                            |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/recipe-assistant/status`               | How many recipes and checks you have left today                                                                                                         |
| POST   | `/api/recipe-assistant/check`                | `{ text }`: Claude turns it into a recipe draft, or explains why not                                                                                  |
| POST   | `/api/recipe-assistant/drafts/:draftId/save` | Save a checked draft to `recipes` (`201`). Optional `{ recipe: { title, meal_class, prep_time, cost, ingredients } }` with the user's corrections |

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

| Page                       | What it does                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/signup`                | Creates the account and logs the user in right away. No email verification.                                                          |
| `/login`                 | Opening a page while logged out (e.g. `/calendar`) goes to `/login?next=/calendar` and back there after logging in.              |
| `/forgot-password`       | Emails a one-time reset link that expires in 1 hour. Always shows the same message, so it doesn't reveal which emails have accounts. |
| `/reset-password?token=` | Sets the new password, logs out every device, then logs this one in.                                                                 |
| `/account/password`      | Change password while logged in (linked from the profile menu). Logs out other devices.                                              |
| `POST /logout`           | Logs out this browser (the profile menu's Log out button).                                                                           |

Passwords must be 8 to 72 characters (bcrypt ignores anything past 72 bytes). Without `SMTP_HOST` in `.env`, emails (password resets) are printed in the server console instead of sent.

#### What's stored in Redis

Logins and password reset links are temporary, so they live in Redis instead of Postgres, and Redis deletes them by itself when they expire. The browser only holds a random session id in the `sid` cookie.

| Redis key                         | What it holds                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sess:<sid>`                    | One login, e.g. `{"userId": 42, "cookie": {...}}`. Redis deletes it by itself after 7 days.                                                         |
| `user_sessions:<userId>`        | The session ids of all of that user's logins, so a password change or reset can log out their other devices.                                          |
| `reset:<tokenHash>`             | A password reset link (a hash of its token, never the token itself) and the user it's for. Expires after 1 hour, and is deleted as soon as it's used. |
| `reset_user:<userId>`           | That user's current reset link, so only the newest one works and changing the password cancels it.                                                    |
| `reset_cooldown:<userId>`       | Exists for 60 seconds after a reset email is sent, so a user can get at most one per minute.                                                          |
| `recipe_draft:<draftId>`        | A recipe the AI assistant checked, waiting to be saved. Expires after 30 minutes.                                                                     |
| `recipe_checks:<date>:<userId>` | How many AI checks that user has run today (limit 5).                                                                                                 |

Logging out deletes the session. Restarting the server doesn't log anyone out, but clearing Redis logs everyone out and cancels any reset links. To see the keys locally: `redis-cli --scan --pattern 'sess:*'` (or `'reset*'`).

The old `session`, `pending_signups` and `password_reset_tokens` tables in Postgres aren't used anymore. Migration `005_drop_unused_auth_tables.sql` removes them.

Rate limits are per IP address and kept in memory, so they reset when the server restarts:

| Form            | Limit                             |
| --------------- | --------------------------------- |
| Login           | 10 wrong passwords per 15 minutes |
| Change password | 10 wrong passwords per 15 minutes |
| Forgot password | 5 requests per 15 minutes         |
| Signup          | 10 per hour                       |

### Recipe ratings

Users rate recipes from 1 to 5 stars, on the recipe page and the Liked page. Each person's rating is private; everyone only sees a recipe's average and how many ratings it has.

**Only after you've made it.** A recipe can be rated once it has been on that user's meal plan for today or an earlier day, so it can be rated the same day it's planned ("today" is in `APP_TIME_ZONE`). Until then the stars are locked, with a note saying when they can rate ("You can rate this on Fri, Nov 27") or "Add it to your meal plan to rate it". The server enforces it: `PUT /api/me/ratings/:id` answers `403` otherwise. Ratings given before this rule stay and still count, removing your own rating is always allowed, and removing a planned meal keeps its rating. The rule is in `back/src/canRate.js`; `rateColumns()` adds `can_rate` and `rate_from` to any query that has a user and a recipe.

| Table                   | What it holds                                                                                                        | Who sees it                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `user_recipe_ratings` | One row per user per recipe: `rating` (1–5), `rated_at`, `updated_at`                                         | Only that user (through `/api/me/ratings`) |
| `recipe_rating_stats` | One row per recipe: `rating_sum`, `rating_count`, and `rating_avg` (worked out by Postgres from the other two) | Everyone, as "4.3 · 12 ratings"             |

**How the two stay in sync:** a trigger on `user_recipe_ratings` (`recipe_rating_stats_sync`, in migration `012`) updates `recipe_rating_stats` in the same transaction as every change, so route code never touches the totals:

- New rating: adds it to `rating_sum` and adds 1 to `rating_count`
- Changed rating (e.g. 4 → 2): subtracts the old value and adds the new one. The count stays the same
- Removed rating, deleted user or deleted recipe: subtracts it and takes 1 off the count

The totals store a sum and count rather than an average, so they never drift from rounding. If they're ever edited by hand, the "Rebuild" block at the bottom of `012_recipe_ratings.sql` recalculates them from `user_recipe_ratings`.

**Things to know:**

- Ratings don't depend on likes: any recipe you've made can be rated, and unliking a recipe keeps its rating. Search results are the next place to show them.
- Never return other users' rows from `user_recipe_ratings`. Show `recipe_rating_stats` instead.
- To show ratings in a new query, join the totals, and your own rating if you need it:
  ```sql
  left join recipe_rating_stats rs on rs.recipe_id = r.recipe_id
  left join user_recipe_ratings ur on ur.recipe_id = r.recipe_id and ur.user_id = $1
  ```
- Code: `back/src/routes/ratings.js` (API), `back/src/canRate.js` (who may rate), `front/views/partials/star-rating.ejs` with `front/public/js/star-rating.js` and `front/public/css/star-rating.css` (stars), `isRating` in `back/src/validators.js`.

### Onboarding tour

The first time someone uses the app, a welcome popup offers a one-minute tour: **Show me around** or **No thanks**. The tour goes through Home, Recipes, Meal Plan, Pantry, Shopping, Liked and the profile menu, highlighting one thing on each page. **Take the tour** in the profile menu replays it any time. However the tour ends, it drops the user off on Home.

**First dinner.** On the Meal Plan step, if tonight has no dinner yet, the tour offers a real dinner recipe (liked ones first, then quick ones; **Swap** shows another). Nothing is saved until the user taps **Add to my plan**; it then becomes a normal calendar row they can remove like any other, so the Shopping step shows a real list instead of an empty one. These adds log `onboarding_dinner_planned`, **not** `add_to_calendar_*`, so they stay out of the OKR numbers. The last card encourages the user to plan a meal on their own.

The popup is offered once per account. `users.onboarding_status` (migration `013`) records what happened:

| Status        | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| `null`      | Not offered yet. The popup shows on their next page load |
| `skipped`   | Said No thanks (or closed the popup)                     |
| `started`   | Began the tour but left partway                          |
| `completed` | Reached the last step, on their first go or a replay     |

Any status other than `null` means the popup won't show again. `onboarding_updated_at` is when it last changed. The events table also gets `onboarding_skipped` / `_started` / `_completed` and one `onboarding_step_viewed` per step, so drop-off can be measured later.

**Things to know:**

- To see the popup again while testing: `update users set onboarding_status = null, onboarding_updated_at = null where email = 'you@example.com';`
- The steps and their text are the `STEPS` list at the top of `front/public/js/onboarding.js`. Each one highlights an element marked `data-tour="..."` in that page's view. If you rename or remove one of those elements, keep the `data-tour` attribute, or the step falls back to a card in the middle of the screen.
- Code: `front/views/partials/onboarding.ejs` (included by `profile-menu.ejs`, so every logged-in page has it), `front/public/js/onboarding.js`, `front/public/css/onboarding.css`, `back/src/routes/onboarding.js`.

### Changing the database

Don't edit tables only in pgAdmin, because teammates won't know. Instead:

1. Add a new numbered file to `back/db/migrations/` (next is `016_...sql`). Write it so it's safe to run more than once (`if not exists`, or check first like `006` does).
2. Update `back/db/schema.sql` so brand-new setups get the change too.
3. Run `npm run db:migrate` to apply it, and commit both files.

Teammates then run `npm run db:migrate` after pulling. It only runs the files their database hasn't had yet (they're recorded in the `schema_migrations` table) and never drops data. **Never run `npm run db:init` against the shared Neon database:** it drops and recreates every table.

| Migration                                                                               | What it changes                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `001_user_data.sql`                                                                   | Per-user `user_pantry` and `user_liked_recipes`, and `users.role` (user or admin)                                                                                                        |
| `002_email_verification.sql`, `003_pending_signups.sql`, `004_password_reset.sql` | Email verification and reset tables. No longer used; `005` removes them                                                                                                                      |
| `005_drop_unused_auth_tables.sql`                                                     | Drops `pending_signups`, `session` and `password_reset_tokens` (that data lives in Redis now)                                                                                            |
| `006_calendar_multiple_dishes.sql`                                                    | `calendar` gets a `calendar_id` key, so a meal can hold several dishes; adds Snack (4) and Dessert (5) slots. Guide: [`calendar_multiple_dishes.md`](back/db/calendar_multiple_dishes.md) |
| `007_recipe_created_by.sql`                                                           | `recipes.created_by` and `created_at`, so the AI assistant can record who added a recipe and limit each user to 3 a day                                                                    |
| `008_users_created_at.sql`                                                            | `users.created_at`, so the OKRs can tell new users from old ones                                                                                                                             |
| `009_events.sql`                                                                      | `events`, a general log of things users do, used for the OKRs (`src/routes/admin.js`)                                                                                                      |
| `010_okr_first_calendar_starts.sql`                                                   | A shared database function for "a new user's first add to calendar", used by OKRs 3 and 4                                                                                                      |
| `011_avatar_color.sql`                                                                | `users.avatar_color`, the color behind a user's initials                                                                                                                                     |
| `012_recipe_ratings.sql`                                                              | `user_recipe_ratings` (each user's private rating) and `recipe_rating_stats` (each recipe's totals), plus the trigger that keeps them in sync. See [Recipe ratings](#recipe-ratings)        |
| `013_onboarding.sql`                                                                  | `users.onboarding_status` and `onboarding_updated_at`, so the first-visit tour is only offered once. See [Onboarding tour](#onboarding-tour)                                                |
| `014_shopping_removed.sql`                                                            | `user_shopping_removed`, the items each user took off their shopping list (one row per planned dish and ingredient)                                                                          |
| `015_recipe_image_path.sql` | `recipes.image_path`, each recipe's photo for the Home page's daily picks. The shared Neon database already had it (added by hand), so there it does nothing |
