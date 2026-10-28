-- =====================================================================
-- Meal Planner - database schema (Supabase / PostgreSQL)
-- Built from Meal_Planning_ERD.pdf
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Safe to run on a fresh project.
--
-- Naming: Postgres lowercases unquoted names, so tables/columns use
-- snake_case (RecipeTitle -> recipe_title). This keeps the Supabase
-- JS client simple: supabase.from('recipes').select('recipe_title').
--
-- Changes from the ERD (on purpose):
--   * "User" -> users          ("user" is a reserved word in Postgres)
--   * users.password removed   (Supabase Auth stores passwords securely;
--                               users.auth_id links to that login)
--   * users.phone is text      (bigint drops leading 0s and "+1")
--   * ingredients.ingredient_name added (the ERD had no name column)
--   * calendar PK = (user_id, date, meal_slot) instead of date alone,
--     so more than one user/meal can exist on the same day
-- =====================================================================


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
  user_id      int generated always as identity primary key,
  auth_id      uuid unique references auth.users (id) on delete cascade,
  first_name   text,
  last_name    text,
  email        text unique not null,
  phone        text,
  profile_pic  text            -- URL (e.g. from Supabase Storage)
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
  pantry_amount_id   int,              -- kept from ERD; no table defined for it yet
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
  user_id    int  not null references users (user_id) on delete cascade,
  date       date not null,
  meal_slot  int  not null,            -- e.g. 1 = breakfast, 2 = lunch, 3 = dinner
  recipe_id  int  not null references recipes (recipe_id),
  primary key (user_id, date, meal_slot)
);


-- ---------- Indexes on foreign keys (faster joins) ----------

create index on recipes (recipe_class_id);
create index on ingredients (measure_amount_id);
create index on recipe_ingredients (ingredient_id);
create index on calendar (recipe_id);


-- =====================================================================
-- Access rules (Row Level Security)
-- The publishable key lives in frontend code, so anyone can see it.
-- RLS is what actually decides who can read/write each table.
--   * Recipe-catalog tables: anyone can read, logged-in users can edit
--   * users / calendar: logged-in users only see and edit their own rows
-- Tighten these later as the app matures.
-- =====================================================================

grant usage on schema public to anon, authenticated;
grant select on recipe_classes, measurements, recipes, ingredients, recipe_ingredients to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

alter table recipe_classes     enable row level security;
alter table measurements       enable row level security;
alter table recipes            enable row level security;
alter table ingredients        enable row level security;
alter table recipe_ingredients enable row level security;
alter table users              enable row level security;
alter table calendar           enable row level security;

-- Catalog tables: public read, logged-in write
create policy "public read"      on recipe_classes     for select using (true);
create policy "auth write"       on recipe_classes     for all to authenticated using (true) with check (true);
create policy "public read"      on measurements       for select using (true);
create policy "auth write"       on measurements       for all to authenticated using (true) with check (true);
create policy "public read"      on recipes            for select using (true);
create policy "auth write"       on recipes            for all to authenticated using (true) with check (true);
create policy "public read"      on ingredients        for select using (true);
create policy "auth write"       on ingredients        for all to authenticated using (true) with check (true);
create policy "public read"      on recipe_ingredients for select using (true);
create policy "auth write"       on recipe_ingredients for all to authenticated using (true) with check (true);

-- Users: only your own profile row
create policy "own profile" on users
  for all to authenticated
  using (auth_id = auth.uid())
  with check (auth_id = auth.uid());

-- Calendar: only your own meal plan
create policy "own calendar" on calendar
  for all to authenticated
  using (user_id in (select user_id from users where auth_id = auth.uid()))
  with check (user_id in (select user_id from users where auth_id = auth.uid()));


-- =====================================================================
-- Starter data (optional, so the frontend has something to show)
-- =====================================================================

insert into recipe_classes (recipe_class_desc) values
  ('Breakfast'), ('Lunch'), ('Dinner'), ('Snack'), ('Dessert');

insert into measurements (measurement_desc) values
  ('Cup'), ('Tablespoon'), ('Teaspoon'), ('Ounce'), ('Pound'), ('Gram'), ('Each');
