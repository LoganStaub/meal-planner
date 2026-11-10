-- =====================================================================
-- 002: several dishes per meal, plus Snack and Dessert
--
-- Before: calendar's primary key was (user_id, date, meal_slot), so each
-- meal on a day could hold only one recipe.
-- After:
--   * calendar_id is the primary key, so a meal can hold several dishes
--   * the same recipe still can't be added to the same meal twice
--   * meal_slot is 1-5: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert
-- Existing rows are kept.
--
-- HOW TO RUN (once, on a database created before this change):
--   psql "$DATABASE_URL" -f db/002_calendar_multiple_dishes.sql
-- New databases get this from schema.sql already.
-- =====================================================================

begin;

alter table calendar drop constraint calendar_pkey;

alter table calendar
  add column calendar_id int generated always as identity primary key;

-- Its index starts with (user_id, date), so it also speeds up the
-- calendar page's "meals between these dates" query.
alter table calendar
  add constraint calendar_unique_dish unique (user_id, date, meal_slot, recipe_id);

alter table calendar
  add constraint calendar_meal_slot_check check (meal_slot between 1 and 5);

commit;
