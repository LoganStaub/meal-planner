-- =====================================================================
-- 001: per-user data, user roles and saved login sessions
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Only ADDS to the database. Nothing is dropped, so branches that still
-- use recipes.liked or ingredients.pantry_amount_id keep working.
-- Safe to run more than once.
-- =====================================================================


-- ---------- User roles ----------
-- 'user' for everyone who signs up; 'admin' can edit the shared recipe
-- and ingredient lists. Make someone an admin with:
--   npm run user:role -- someone@example.com admin

alter table users
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));


-- ---------- Liked recipes (replaces recipes.liked) ----------

create table if not exists user_liked_recipes (
  user_id    int not null references users (user_id) on delete cascade,
  recipe_id  int not null references recipes (recipe_id) on delete cascade,
  liked_at   timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists user_liked_recipes_recipe_id_idx on user_liked_recipes (recipe_id);


-- ---------- Each user's pantry (replaces ingredients.pantry_amount_id) ----------
-- ingredients is now the shared list of ingredient names that recipes and
-- pantries point to. A user's pantry is their rows in this table.

create table if not exists user_pantry (
  user_id           int not null references users (user_id) on delete cascade,
  ingredient_id     int not null references ingredients (ingredient_id) on delete cascade,
  pantry_amount_id  int not null default 0 check (pantry_amount_id in (0, 1, 2)),  -- 0 plenty, 1 low, 2 none
  primary key (user_id, ingredient_id)
);

create index if not exists user_pantry_ingredient_id_idx on user_pantry (ingredient_id);


-- ---------- Login sessions (used by connect-pg-simple) ----------
-- Keeps people logged in when the server restarts.

create table if not exists session (
  sid     varchar not null primary key,
  sess    json not null,
  expire  timestamp(6) not null
);

create index if not exists session_expire_idx on session (expire);


-- ---------- Keep existing data ----------
-- Before this, likes and pantry statuses belonged to nobody. The only user
-- so far is the seeded test user (user_id 1, who also owns the calendar
-- rows), so their data moves to that user.

insert into user_liked_recipes (user_id, recipe_id)
select 1, recipe_id from recipes
where liked and exists (select 1 from users where user_id = 1)
on conflict do nothing;

insert into user_pantry (user_id, ingredient_id, pantry_amount_id)
select 1, ingredient_id, pantry_amount_id from ingredients
where pantry_amount_id in (0, 1, 2) and exists (select 1 from users where user_id = 1)
on conflict do nothing;
