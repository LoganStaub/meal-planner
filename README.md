# Meal Planner

- **Frontend:** React + Vite, in `frontend/`
- **Database:** Supabase (PostgreSQL). The full schema lives in `supabase/schema.sql`.

There is no separate backend server — the frontend talks to Supabase directly, and
Row Level Security (below) decides who can read/write what.

## Project layout

```
frontend/
  .env.example          copy to .env and add your Supabase keys
  scripts/              Node-only helpers (npm run check)
  src/
    main.jsx            app entry
    App.jsx             page routes — add new pages here
    pages/              one file per page (Home, Recipes, MealPlan…)
    components/         shared UI (NavBar…)
    api/                all database queries — pages import from here
    lib/supabase.js     the one shared Supabase client
    styles/
supabase/
  schema.sql            database tables, access rules, starter data
```

## Get running (teammates)

1. **Accept the invites** – GitHub repo invite (check email) and Supabase team invite (valid 24 hours).
2. **Clone and install**
   ```bash
   git clone <repo-url>
   cd <repo-folder>/frontend
   npm install
   ```
3. **Add your keys** – copy `frontend/.env.example` to `frontend/.env`, then paste in the Project URL and the
   **publishable** key from Supabase → Project Settings → API Keys. `.env` is git-ignored, so keys never get committed.
4. **Test the database connection**
   ```bash
   npm run check
   ```
   You should see a table of recipe classes (Breakfast, Lunch, …).
5. **Start the site**
   ```bash
   npm run dev
   ```
   Then open the URL it prints (usually http://localhost:5173).

Requires Node.js 18+. Run all `npm` commands from inside `frontend/`.

## Adding a page

1. Create `frontend/src/pages/MyPage.jsx`.
2. Import it in `frontend/src/App.jsx` and add a `<Route path="/my-page" element={<MyPage />} />`.
3. Add a link to it in `frontend/src/components/NavBar.jsx` if it belongs in the menu.

## Tables

| Table | Key | What it holds |
|---|---|---|
| `users` | `user_id` | Profile info; `auth_id` links to the Supabase Auth login |
| `recipe_classes` | `recipe_class_id` | Breakfast, Lunch, Dinner… |
| `recipes` | `recipe_id` | Title, cost, macros, prep time, instructions, liked |
| `ingredients` | `ingredient_id` | Ingredient name, pantry amount, default measurement |
| `measurements` | `measure_amount_id` | Cup, Tablespoon, Gram… |
| `recipe_ingredients` | (`recipe_id`, `recipe_seq_number`) | Which ingredients go in each recipe, in order |
| `calendar` | (`user_id`, `date`, `meal_slot`) | Each user's planned meals |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Using the database in the frontend

Put queries in `frontend/src/api/` and call those functions from pages:

```js
// in a page
import { getRecipes } from '../api/recipes.js'
const recipes = await getRecipes()
```

```js
// in src/api/*.js
import { supabase } from '../lib/supabase.js'
const { data, error } = await supabase.from('recipes').select('*')
```

Existing examples (joins, inserts, meal plan by date) are in `src/api/recipes.js` and `src/api/mealPlan.js`.

Env vars must start with `VITE_` to be visible in the browser; they are read with
`import.meta.env.VITE_SUPABASE_URL`.

## Who can read/write what (Row Level Security)

- **Recipes, ingredients, classes, measurements:** anyone can read; signed-in users can add/edit.
- **users and calendar:** signed-in users only see their own rows.

So `users` and `calendar` come back **empty** until someone signs in with
`supabase.auth.signUp()` / `signInWithPassword()`. That's expected, not a bug.

Note: signing up does **not** create a `users` row automatically. After `signUp()`, the
frontend must insert one (`{ auth_id: user.id, email, ... }`) before the calendar can be used.

## Changing the database

Don't edit tables only in the dashboard — teammates won't know. Instead:
1. Write the change as SQL and run it in Supabase → SQL Editor.
2. Add the same SQL to a new file in `supabase/` (e.g. `002_add_user_likes.sql`) and commit it.
