# Database update 002: several dishes per meal (teammate steps)

**Who this is for:** everyone on the team who runs the app against a database.
**When:** before you run any code from the `search-page` branch, or from `main` once that branch is merged.
**Time:** about 5 minutes.

You can do this by hand, or hand it to Claude Code. To use Claude Code, open it in the repo and paste the prompt from [Section 8](#8-prompt-for-claude-code).

---

## 1. What changed and why

The Calendar used to allow **one recipe per meal**, so a day held at most Breakfast, Lunch and Dinner. Now a meal can hold several dishes, and there are two new meal slots:

| `meal_slot` | Meal |
| --- | --- |
| 1 | Breakfast |
| 2 | Lunch |
| 3 | Dinner |
| 4 | Snack (new) |
| 5 | Dessert (new) |

The `calendar` table changes like this:

| | Before | After |
| --- | --- | --- |
| Primary key | `(user_id, date, meal_slot)` | new column `calendar_id` (auto-numbered) |
| Uniqueness | one recipe per meal | `calendar_unique_dish`: the same recipe can't be in the same meal twice, but a meal can have several different recipes |
| Allowed slots | any number | `calendar_meal_slot_check`: only 1–5 |

**Existing calendar rows are kept.** Each row gets a `calendar_id` automatically, and nothing is deleted.

The migration is [`back/db/002_calendar_multiple_dishes.sql`](002_calendar_multiple_dishes.sql):

```sql
begin;
alter table calendar drop constraint calendar_pkey;
alter table calendar add column calendar_id int generated always as identity primary key;
alter table calendar add constraint calendar_unique_dish unique (user_id, date, meal_slot, recipe_id);
alter table calendar add constraint calendar_meal_slot_check check (meal_slot between 1 and 5);
commit;
```

It runs inside a transaction. If any step fails, nothing changes, so a failed or repeated run can't half-apply.

### What breaks if you skip it

The new code expects the new table. If you run it against an old database:

| Where | What you see |
| --- | --- |
| `/calendar` page | Meals fail to load. The server logs `column c.calendar_id does not exist` |
| Adding a recipe from `/search` | Error. The server logs `there is no unique or exclusion constraint matching the ON CONFLICT specification` |
| `npm run db:seed` | Fails with the same `ON CONFLICT` error |
| Removing a meal on the Calendar | Fails, because it now removes by `calendar_id` |

---

## 2. Do I need to run it? (decide first)

Everything below is run from the **`back/`** folder, which is where `.env` lives. Your `DATABASE_URL` in `back/.env` decides which database you're touching.

| Your situation | What to do |
| --- | --- |
| **Shared Neon database** (`DATABASE_URL` contains `neon.tech`) | It has probably **already been migrated**, because the branch was built against it. Run the check in Section 3. If it says "already migrated", you're done. Don't run anything else. |
| **Your own local Postgres** with tables made before this change | Run the check, then the migration (Sections 3–5). |
| **Brand-new setup** (you're about to run `npm run db:init` for the first time) | Nothing to do. `db/schema.sql` already includes this change. Don't run 002 afterwards; it would fail harmlessly with `constraint "calendar_pkey" ... does not exist`. |
| **Local database with nothing in it you care about** | Either run the migration, or reset with `npm run db:init`. **`db:init` deletes all data in every table.** |

> ⚠️ **Never run `npm run db:init` against the shared Neon database.** It drops and recreates every table, and everyone loses their data.

---

## 3. Check whether your database is already migrated

First get the latest code:

```bash
git fetch origin
git checkout search-page        # or: git checkout main && git pull  (after it's merged)
cd back
npm install
```

Then run this from `back/`. It uses the project's own connection settings, so you don't need `psql`:

```bash
node --input-type=module -e "
import { pool } from './src/db.js'
const cols = await pool.query(\"select 1 from information_schema.columns where table_name = 'calendar' and column_name = 'calendar_id'\")
const bad = await pool.query('select count(*)::int as n from calendar where meal_slot not between 1 and 5')
const rows = await pool.query('select count(*)::int as n from calendar')
console.log(cols.rowCount ? 'ALREADY MIGRATED - nothing to do' : 'NOT MIGRATED - run step 5')
console.log('calendar rows:', rows.rows[0].n, '| rows with meal_slot outside 1-5:', bad.rows[0].n)
await pool.end()
"
```

You may also see a long `SECURITY WARNING: The SSL modes 'prefer', 'require'...` message from the `pg` library when connecting to Neon. It's harmless and doesn't mean anything failed.

- **`ALREADY MIGRATED`**: stop here and jump to [Section 6](#6-test-the-app).
- **`NOT MIGRATED`** with `rows with meal_slot outside 1-5: 0`: continue to Section 4.
- **`NOT MIGRATED`** with that count above 0: fix those rows first (see [Troubleshooting](#7-troubleshooting)). Otherwise the migration fails on the 1–5 check.

> In PowerShell the escaped quotes above can be awkward. If the command errors before it reaches the database, use Git Bash, or copy the JavaScript between the outer quotes into a temporary `check.mjs` inside `back/`, run `node check.mjs`, then delete the file.

---

## 4. Back up (optional, recommended for a local DB with real data)

If you have `pg_dump` installed (it comes with the PostgreSQL installer):

```bash
pg_dump "<your DATABASE_URL>" -t calendar -f calendar-backup.sql
```

Keep `calendar-backup.sql` **outside the repo**, or delete it afterwards. Don't commit it.

---

## 5. Run the migration

From `back/`, pick one option.

**Option A: Node (no extra tools needed)**

```bash
node --input-type=module -e "
import { readFile } from 'node:fs/promises'
import { pool } from './src/db.js'
await pool.query(await readFile('db/002_calendar_multiple_dishes.sql', 'utf8'))
console.log('Migration 002 applied')
await pool.end()
"
```

**Option B: psql**

```bash
psql "<your DATABASE_URL>" -f db/002_calendar_multiple_dishes.sql
```

Expected psql output: `BEGIN`, `ALTER TABLE` ×4, `COMMIT`.

### Verify

Run the check from Section 3 again. It should now say `ALREADY MIGRATED`. To see the exact constraints:

```bash
node --input-type=module -e "
import { pool } from './src/db.js'
const { rows } = await pool.query(\"select conname from pg_constraint where conrelid = 'calendar'::regclass and contype in ('p', 'u', 'c') order by conname\")
console.log(rows.map(r => r.conname).join('\n'))
await pool.end()
"
```

You should see exactly these three:

```
calendar_meal_slot_check
calendar_pkey
calendar_unique_dish
```

`calendar_pkey` is still there, but it now sits on `calendar_id`.

---

## 6. Test the app

```bash
npm run check      # should print the recipe classes (Breakfast, Lunch, ...)
npm start          # or: npm run dev
```

Then in the browser at <http://localhost:3000>:

1. **Calendar** (`/calendar`): the week loads with no red error box. Each day shows Breakfast, Lunch and Dinner, plus a **Snacks & desserts** group.
2. **Add a dish:** click **+ Add breakfast** (or any meal). On Search, click **Add to breakfast** on a recipe. You should land back on the Calendar with it added.
3. **Several dishes:** click **+ Add another** on a meal that already has a dish and add a second recipe. Both should show.
4. **Duplicate warning:** add a recipe that's already on that day to a different meal. You should get an "Add it again?" popup.
5. **Remove:** click the **×** on a dish. Only that dish disappears.

**Optional test data:** `npm run db:seed` adds user 1 and a few meals this week, including two Wednesday dinners and a Friday dessert. It's safe to run more than once.

---

## 7. Troubleshooting

| Error | Cause | Fix |
| --- | --- | --- |
| `constraint "calendar_pkey" of relation "calendar" does not exist` | Already migrated, or the table was made from the new `schema.sql` | Nothing to do. Run the Section 3 check to confirm. Nothing changed, because the transaction rolled back. |
| `column "calendar_id" of relation "calendar" already exists` | Already migrated | Same as above |
| `check constraint "calendar_meal_slot_check" ... is violated by some row` | Old rows have a `meal_slot` other than 1–5 | Look at them with `select * from calendar where meal_slot not between 1 and 5;`. Then fix them (e.g. `update calendar set meal_slot = 3 where ...`) or delete them, and rerun Section 5. |
| `relation "calendar" does not exist` | Tables were never created | New setup: run `npm run db:init` (only on an empty or throwaway database) |
| `Missing DATABASE_URL` | No `back/.env`, or you're not in `back/` | `cd back`, then copy `.env.example` to `.env` and fill it in |
| Command hangs connecting to Neon | Network, VPN or firewall blocking port 5432 | Try another network. Check that the URL ends in `?sslmode=require` |
| Calendar still errors after migrating | Server started before the migration, or old code | Restart `npm start`. Confirm you're on the latest `search-page`/`main` |

### Undo (only if you really need to)

This only works while every meal still has **at most one dish**. Once anyone has added a second dish to a meal, putting the old primary key back fails, and the transaction rolls back safely.

```sql
begin;
alter table calendar drop constraint calendar_meal_slot_check;
alter table calendar drop constraint calendar_unique_dish;
alter table calendar drop column calendar_id;          -- also drops the new primary key
alter table calendar add primary key (user_id, date, meal_slot);
commit;
```

The current code won't work on the old table, so only undo this if you also go back to older code.

---

## 8. Prompt for Claude Code

Open Claude Code in the repo root and paste this:

> Read `back/db/002_calendar_multiple_dishes.md` and walk me through it for my machine.
> 1. Pull the latest `search-page` branch (or `main` if it's merged), then run `npm install` in `back/`.
> 2. Tell me which database my `back/.env` `DATABASE_URL` points to: local or Neon. **Don't print the password.**
> 3. Run the read-only check from Section 3 and tell me the result.
> 4. If it's **not** migrated and there are no rows with `meal_slot` outside 1–5, **ask me before** running the migration in Section 5. Then run it and verify with the constraint query.
> 5. If it's already migrated, don't run anything that changes the database.
> 6. Never run `npm run db:init` unless I explicitly say this is a throwaway local database.
> 7. Start the server and confirm `/calendar` and `GET /api/users/1/calendar?start=<this Sunday>&end=<this Saturday>` respond without errors, then stop the server.
> 8. Summarize what you did and what I should click through manually (Section 6).

---

## 9. Code changes that come with this (if you're writing code against the calendar)

These API changes ship with the migration. They matter if you have a branch that calls the calendar API.

| Endpoint | Change |
| --- | --- |
| `GET /api/users/:userId/calendar?start=&end=` | Each row now includes **`calendar_id`**. A meal can return several rows, sorted by date, then meal, then the order they were added. |
| `POST /api/users/:userId/calendar` | Body: `{ date, meal_slot (1–5), recipe_id, allow_duplicate? }`. **Adds** a dish instead of replacing the meal. Returns `201` with the new row, including `calendar_id`. If the recipe is already planned that day it returns **`409`** with `{ code: 'already_planned', meal_slots: [...] }`. Resend with `allow_duplicate: true` to put it in a *different* meal; the same meal is never allowed twice. |
| `DELETE /api/users/:userId/calendar/:calendarId` | **New URL.** Removes one dish by its `calendar_id` (`204`, or `404` if it's already gone). |
| `DELETE /api/users/:userId/calendar/:date/:slot` | **Removed.** Use the `calendarId` version above. |

Also:

- `npm run db:seed` (`back/scripts/seedCalendar.js`) now uses `on conflict (user_id, date, meal_slot, recipe_id)`. The old seed script won't run on the migrated table, and the new one won't run on an unmigrated table.
- Future database changes follow the same pattern. Add a numbered file to `back/db/` (next is `003_...sql`), update `back/db/schema.sql` to match, and list it in the README's "Changing the database" table.

### FAQ

**On Neon I see tables that aren't in `schema.sql`** (`user_liked_recipes`, `user_pantry`, plus `role` and `email_verified_at` columns on `users`). Those were added to the shared database separately and aren't part of this migration. No current code uses them, and you don't need them locally.
