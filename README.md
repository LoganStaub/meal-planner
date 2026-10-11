# Meal Planner – Backend

Database: **Supabase (PostgreSQL)**. The full schema lives in `supabase/schema.sql`.

## Get running (teammates)

1. **Accept the invites** – GitHub repo invite (check email) and Supabase team invite (valid 24 hours).
2. **Clone the repo**
   ```bash
   git clone <repo-url>
   cd meal-planner-backend
   npm install
   ```
3. **Add your keys** – copy `.env.example` to `.env`, then paste in the Project URL and the

   **publishable** key from Supabase → Project Settings → API Keys. `.env` is git-ignored, so keys never get committed.
4. **Test it**
   ```bash
   npm run check
   ```
   You should see a table of recipe classes (Breakfast, Lunch, …).

Requires Node.js 18+.

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

```js
import { supabase } from './src/supabaseClient.js'
const { data, error } = await supabase.from('recipes').select('*')
```

More examples (joins, inserts, meal plan by date) are in `src/examples.js`.

> In a Vite/React frontend, env vars must start with `VITE_` and are read with
> `import.meta.env.VITE_SUPABASE_URL` instead of `process.env`.

## Who can read/write what (Row Level Security)

- **Recipes, ingredients, classes, measurements:** anyone can read; signed-in users can add/edit.
- **users and calendar:** signed-in users only see their own rows.

So `users` and `calendar` come back **empty** until someone signs in with
`supabase.auth.signUp()` / `signInWithPassword()`. That's expected, not a bug.

## Changing the database

Don't edit tables only in the dashboard — teammates won't know. Instead:
1. Write the change as SQL and run it in Supabase → SQL Editor.
2. Add the same SQL to a new file in `supabase/` (e.g. `002_add_user_likes.sql`) and commit it.
