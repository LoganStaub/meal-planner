-- =====================================================================
-- Meal Planner - database schema (PostgreSQL)
-- Built from Meal_Planning_ERD.pdf
--
-- HOW TO RUN:  npm run db:init
--   (or, from back/: psql "$DATABASE_URL" -f db/schema.sql)
-- WARNING: this drops and recreates every table, so all data is lost.
--
-- Naming: Postgres lowercases unquoted names, so tables/columns use
-- snake_case (RecipeTitle -> recipe_title).
--
-- Changes from the ERD (on purpose):
--   * "User" -> users          ("user" is a reserved word in Postgres)
--   * users.password -> users.password_hash
--                              (store a bcrypt hash, never the password)
--   * users.phone is text      (bigint drops leading 0s and "+1")
--   * ingredients.ingredient_name added (the ERD had no name column)
--   * calendar has its own calendar_id key instead of date alone, so
--     several users, meals and dishes can share a day (see
--     002_calendar_multiple_dishes.sql)
--
-- Access control: this used to be Row Level Security in Supabase.
-- The database is now only reachable through the Express server
-- (src/server.js), so the API routes decide who can read/write what.
-- =====================================================================

drop table if exists calendar, recipe_ingredients, ingredients, recipes,
  users, measurements, recipe_classes cascade;


-- ---------- Lookup tables ----------

create table recipe_classes (
  recipe_class_id    int generated always as identity primary key,
  recipe_class_desc  text not null
);

create table measurements (
  measure_amount_id  int generated always as identity primary key,
  measurement_desc   text not null
);


-- ---------- Users ----------

create table users (
  user_id        int generated always as identity primary key,
  first_name     text,
  last_name      text,
  email          text unique not null,
  password_hash  text,            -- bcrypt hash; null until login is built
  phone          text,
  profile_pic    text             -- URL
);


-- ---------- Recipes ----------

create table recipes (
  recipe_id        int generated always as identity primary key,
  recipe_class_id  int references recipe_classes (recipe_class_id),
  recipe_title     text not null,
  cost             double precision,
  macros           text,
  prep_time        double precision,   -- minutes
  instructions     text,
  liked            boolean not null default false
);


-- ---------- Ingredients ----------

create table ingredients (
  ingredient_id      int generated always as identity primary key,
  ingredient_name    text not null,
  pantry_amount_id   int,              -- pantry slider: 0 = plenty, 1 = running out, 2 = none
  measure_amount_id  int references measurements (measure_amount_id)
);


-- ---------- Recipe_Ingredients (bridge table) ----------

create table recipe_ingredients (
  recipe_id          int not null references recipes (recipe_id) on delete cascade,
  recipe_seq_number  int not null,
  ingredient_id      int not null references ingredients (ingredient_id),
  measure_amount_id  int references measurements (measure_amount_id),
  amount             text,
  primary key (recipe_id, recipe_seq_number)
);


-- ---------- Calendar ----------

create table calendar (
  calendar_id  int  generated always as identity primary key,
  user_id      int  not null references users (user_id) on delete cascade,
  date         date not null,
  -- 1 = breakfast, 2 = lunch, 3 = dinner, 4 = snack, 5 = dessert
  meal_slot    int  not null constraint calendar_meal_slot_check check (meal_slot between 1 and 5),
  recipe_id    int  not null references recipes (recipe_id),
  -- A meal can have several dishes, but not the same recipe twice
  constraint calendar_unique_dish unique (user_id, date, meal_slot, recipe_id)
);


-- ---------- Indexes on foreign keys (faster joins) ----------

create index on recipes (recipe_class_id);
create index on ingredients (measure_amount_id);
create index on recipe_ingredients (ingredient_id);
create index on calendar (recipe_id);


-- =====================================================================
-- Starter data (so the frontend has something to show)
-- =====================================================================

insert into recipe_classes (recipe_class_desc) values
  ('Breakfast'), ('Lunch'), ('Dinner'), ('Snack'), ('Dessert');

insert into measurements (measurement_desc) values
  ('Cup'), ('Tablespoon'), ('Teaspoon'), ('Ounce'), ('Pound'), ('Gram'), ('Each');
