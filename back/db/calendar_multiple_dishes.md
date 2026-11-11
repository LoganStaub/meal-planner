# Calendar: several dishes per meal (migration 006)

**Who this is for:** anyone running the app against a database made before this change.
**Time:** about a minute.

## What changed

Before, `calendar`'s primary key was `(user_id, date, meal_slot)`, so each meal on a day could hold only one recipe. Now:

- `calendar_id` is the primary key, so a meal can hold several dishes
- the same recipe still can't be added to the same meal twice (`calendar_unique_dish`)
- `meal_slot` is 1–5: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert (`calendar_meal_slot_check`)

Existing rows are kept. The SQL is in `db/migrations/006_calendar_multiple_dishes.sql`, and `db/schema.sql` already includes it for new setups.

## What to do

From `back/`, after pulling:

```bash
npm install
npm run db:migrate
```

That's it. Migration 006 checks whether `calendar` already has `calendar_id` and does nothing if it does, so it's safe on every database:

| Your database | What `db:migrate` does |
| --- | --- |
| Made before this change | Applies the change, keeping your rows |
| Made from the new `schema.sql` (`npm run db:init`) | Nothing; it's already there |
| Already changed by hand with the old `db/002_calendar_multiple_dishes.sql` | Nothing; it's already there |

> ⚠️ **Never run `npm run db:init` against the shared Neon database.** It drops and recreates every table, and everyone loses their data. `db:migrate` never drops data.

If it fails with `check constraint "calendar_meal_slot_check" ... is violated by some row`, some old rows have a `meal_slot` other than 1–5. Find them with `select * from calendar where meal_slot not between 1 and 5;`, fix or delete them, and run `npm run db:migrate` again.

## Test it

Start the server (`npm run dev`), log in, and open <http://localhost:3000/calendar>:

1. The week loads. Each day shows Breakfast, Lunch and Dinner, plus a **Snacks & desserts** group.
2. **Add a dish:** click **+ Add breakfast**. On the Recipes page, click **Add to breakfast** on a recipe. You land back on the calendar with it added.
3. **Several dishes:** click **+ Add another** on a meal that has a dish, and add a second recipe. Both show.
4. **Duplicate warning:** add a recipe that's already on that day to a different meal. An "Add it again?" popup appears.
5. **Remove:** click the **×** on a dish. Only that dish disappears.

## API (for code that calls the calendar)

Every route is for the logged-in user. The user comes from the login session, never from the URL, so nobody can read or change someone else's calendar. Without a login they answer `401`.

| Endpoint | What it does |
| --- | --- |
| `GET /api/me/calendar?start=&end=` | Planned dishes between two `YYYY-MM-DD` dates. Each row has `calendar_id`. A meal can return several rows, sorted by date, then meal, then the order they were added. |
| `POST /api/me/calendar` | Body: `{ date, meal_slot (1–5), recipe_id, allow_duplicate? }`. Adds a dish and returns `201` with the new row. If the recipe is already planned that day it returns `409` with `{ code: 'already_planned', meal_slots: [...] }`; send again with `allow_duplicate: true` to put it in a *different* meal. The same meal is never allowed twice. |
| `DELETE /api/me/calendar/:calendarId` | Removes one dish (`204`, or `404` if it's not on your calendar). |

`npm run db:seed` (`scripts/seedCalendar.js`) adds a test user and a few meals this week, including two Wednesday dinners and a Friday dessert. It needs the new table, so run `db:migrate` first.
