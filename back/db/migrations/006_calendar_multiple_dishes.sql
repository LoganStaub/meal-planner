-- =====================================================================
-- 006: several dishes per meal, plus Snack and Dessert
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Before: calendar's primary key was (user_id, date, meal_slot), so each
-- meal on a day could hold only one recipe.
-- After:
--   * calendar_id is the primary key, so a meal can hold several dishes
--   * the same recipe still can't be added to the same meal twice
--   * meal_slot is 1-5: 1 Breakfast, 2 Lunch, 3 Dinner, 4 Snack, 5 Dessert
-- Existing rows are kept. New databases get this from schema.sql already.
--
-- Safe to run more than once: it does nothing if calendar already has
-- calendar_id (e.g. a database set up from the new schema.sql, or one
-- where this was run by hand as db/002_calendar_multiple_dishes.sql).
-- Teammate guide: db/calendar_multiple_dishes.md
-- =====================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'calendar' and column_name = 'calendar_id'
  ) then
    return;
  end if;

  alter table calendar drop constraint calendar_pkey;

  alter table calendar
    add column calendar_id int generated always as identity primary key;

  -- Its index starts with (user_id, date), so it also speeds up the
  -- calendar page's "meals between these dates" query.
  alter table calendar
    add constraint calendar_unique_dish unique (user_id, date, meal_slot, recipe_id);

  alter table calendar
    add constraint calendar_meal_slot_check check (meal_slot between 1 and 5);
end
$$;
