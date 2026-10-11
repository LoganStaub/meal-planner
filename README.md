# Meal Planner

## App Summary

Deciding what to eat every day, and making sure the right groceries are in the house, takes more time and mental energy than most people have to spare. Young adults and busy professionals feel this the most: they end up eating out, repeating the same few meals, or buying food that goes to waste. Meal Planner is a meal planning and recipe discovery app built for them. Users browse a short swipe feed of recipes, like the ones they want to keep, and place them on a calendar to build a meal plan. A virtual pantry tracks which ingredients they have at home and how much is left. A shopping list and recipe search round out the app, so planning, shopping, and cooking happen in one place. This repository holds the database and the first working feature, the Virtual Pantry.

## ERD

![Entity relationship diagram for Meal Planner](docs/erd.png)

The full schema lives in `supabase/schema.sql`.

| Table                  | Key                                    | What it holds                                             |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| `users`              | `user_id`                            | Profile info;`auth_id` links to the Supabase Auth login |
| `recipe_classes`     | `recipe_class_id`                    | Breakfast, Lunch, Dinner…                                |
| `recipes`            | `recipe_id`                          | Title, cost, macros, prep time, instructions, liked       |
| `ingredients`        | `ingredient_id`                      | Ingredient name, pantry amount, default measurement       |
| `measurements`       | `measure_amount_id`                  | Cup, Tablespoon, Gram…                                   |
| `recipe_ingredients` | (`recipe_id`, `recipe_seq_number`) | Which ingredients go in each recipe, in order             |
| `calendar`           | (`user_id`, `date`, `meal_slot`) | Each user's planned meals                                 |

Names are **snake_case** (`recipe_title`, not `RecipeTitle`).

## Tech Stack

| Layer    | What we used                                                                                  |
| -------- | --------------------------------------------------------------------------------------------- |
| Frontend | Plain HTML, CSS, and JavaScript in a single page (`mp-vertical-slice/index.html`)           |
| API      | Supabase's auto-generated REST API, called from the browser with the`supabase-js` v2 client |
| Database | Supabase (hosted PostgreSQL), with Row Level Security controlling access                      |
| Tooling  | Node.js 18+ for the connection check script (`npm run check`)                               |

**Why this fits our team:** Supabase is a backend as a service, so we did not have to build or host our own server. Everyone on the team can see the tables in the Supabase dashboard, the schema is kept as SQL in this repo, and the free tier covers a class project. Keeping the frontend as plain HTML and JavaScript means there is no build step, so the page runs by opening one file.

**About the key in `index.html`:** it is Supabase's *publishable* key, which is designed to be used in a browser. Access to the data is controlled by Row Level Security, not by hiding this key. The secret key is never in this repo, and each teammate's `.env` file is git-ignored.

## How to Get It Running

### Run the app

1. Clone the repo:
   ```bash
   git clone https://github.com/LoganStaub/meal-planner-backend.git
   cd meal-planner-backend
   ```
2. Open `mp-vertical-slice/index.html` in a browser. Double-clicking the file works, or in VS Code right-click it and choose **Open with Live Server**.

That is all the page needs. It loads the Supabase client from a CDN and connects to our hosted database, so an internet connection is required but nothing has to be installed.

### Teammate setup (optional connection check)

1. **Accept the invites** – GitHub repo invite (check email) and Supabase team invite (valid 24 hours).
2. **Install dependencies** (requires Node.js 18+):
   ```bash
   npm install
   ```
3. **Add your keys** – copy `.env.example` to `.env`, then paste in the Project URL and the **publishable** key from Supabase → Project Settings → API Keys. The Project URL looks like `https://<project-id>.supabase.co`, not the dashboard address. `.env` is git-ignored, so keys never get committed.
4. **Test it**
   ```bash
   npm run check
   ```

   You should see a table of recipe classes (Breakfast, Lunch, …).

## Verifying the Vertical Slice

The vertical slice is **adding an ingredient to the Virtual Pantry**.

1. Open `mp-vertical-slice/index.html`. The existing ingredients load from the database under **My Ingredients**.
2. Type an ingredient name (for example, `Beans`) into the **Enter ingredient** box.
3. Click **Add+**. The page sends an insert to the `ingredients` table in Supabase, gets the new row's ID back, and shows the ingredient at the bottom of the list with the status "Plenty Left".
4. Refresh the page (F5). The ingredient is still in the list, because the page reloads everything from the database.
5. Optional: in the Supabase dashboard, open Table Editor → `ingredients` to see the new row.

## For Teammates

### Using the database in the frontend

```js
import { supabase } from './src/supabaseClient.js'
const { data, error } = await supabase.from('recipes').select('*')
```

More examples (joins, inserts, meal plan by date) are in `src/examples.js`.

> In a Vite/React frontend, env vars must start with `VITE_` and are read with
> `import.meta.env.VITE_SUPABASE_URL` instead of `process.env`.

### Who can read/write what (Row Level Security)

- **Ingredients:** anyone can read, add, edit, and delete (the Virtual Pantry page works without signing in).
- **Recipes, classes, measurements:** anyone can read; signed-in users can add/edit.
- **users and calendar:** signed-in users only see their own rows.

So `users` and `calendar` come back **empty** until someone signs in with
`supabase.auth.signUp()` / `signInWithPassword()`. That's expected, not a bug.

### Changing the database

Don't edit tables only in the dashboard — teammates won't know. Instead:

1. Write the change as SQL and run it in Supabase → SQL Editor.
2. Add the same SQL to a new file in `supabase/` (e.g. `002_add_user_likes.sql`) and commit it.
