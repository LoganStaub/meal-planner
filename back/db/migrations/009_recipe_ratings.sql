-- =====================================================================
-- 009: recipe ratings (1-5 stars)
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Two tables:
--   user_recipe_ratings  each user's own rating. PRIVATE: the API only
--                        ever returns a user's ratings to that same user.
--   recipe_rating_stats  each recipe's anonymous totals (sum + count),
--                        which is what everyone else sees.
--
-- The totals are kept in sync by a trigger on user_recipe_ratings, so no
-- route can forget to update them, and two people rating at once can't
-- overwrite each other. The totals can always be rebuilt from the
-- per-user table (see the bottom of this file).
--
-- Only ADDS to the database. Safe to run more than once.
-- =====================================================================


-- ---------- Each user's own rating (private) ----------

create table if not exists user_recipe_ratings (
  user_id     int not null references users (user_id) on delete cascade,
  recipe_id   int not null references recipes (recipe_id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  rated_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, recipe_id)          -- one rating per user per recipe
);

create index if not exists user_recipe_ratings_recipe_id_idx on user_recipe_ratings (recipe_id);


-- ---------- Each recipe's totals (anonymous) ----------
-- Stores sum + count rather than the average, so every change is exact
-- (an average updated over and over would drift from rounding).

create table if not exists recipe_rating_stats (
  recipe_id     int primary key references recipes (recipe_id) on delete cascade,
  rating_sum    int not null default 0,
  rating_count  int not null default 0,
  rating_avg    numeric(3, 2) generated always as (
                  case when rating_count > 0 then round(rating_sum::numeric / rating_count, 2) end
                ) stored,
  updated_at    timestamptz not null default now(),
  -- every rating is 1-5, so the sum must be between count and 5 x count
  constraint recipe_rating_stats_valid check (
    rating_count >= 0 and rating_sum between rating_count and rating_count * 5
  )
);


-- ---------- Trigger: keep the totals in sync ----------
-- Runs inside the same transaction as the rating change, so the totals
-- and the ratings always match. A change of rating subtracts the old
-- value and adds the new one; the count only changes on insert/delete.

create or replace function recipe_rating_stats_sync() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update recipe_rating_stats
    set rating_sum   = rating_sum - old.rating,
        rating_count = rating_count - 1,
        updated_at   = now()
    where recipe_id = old.recipe_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    insert into recipe_rating_stats (recipe_id, rating_sum, rating_count)
    values (new.recipe_id, new.rating, 1)
    on conflict (recipe_id) do update
    set rating_sum   = recipe_rating_stats.rating_sum + excluded.rating_sum,
        rating_count = recipe_rating_stats.rating_count + 1,
        updated_at   = now();
  end if;

  return null;  -- after-trigger: the return value is ignored
end;
$$;

drop trigger if exists user_recipe_ratings_sync_stats on user_recipe_ratings;
create trigger user_recipe_ratings_sync_stats
after insert or delete or update of rating, recipe_id on user_recipe_ratings
for each row execute function recipe_rating_stats_sync();


-- ---------- Rebuild the totals from the per-user ratings ----------
-- Does nothing on a fresh database. Copy this block into psql to repair
-- the totals if they're ever edited by hand.

update recipe_rating_stats s
set rating_sum = 0, rating_count = 0, updated_at = now()
where not exists (select 1 from user_recipe_ratings ur where ur.recipe_id = s.recipe_id);

insert into recipe_rating_stats (recipe_id, rating_sum, rating_count)
select recipe_id, sum(rating), count(*)
from user_recipe_ratings
group by recipe_id
on conflict (recipe_id) do update
set rating_sum   = excluded.rating_sum,
    rating_count = excluded.rating_count,
    updated_at   = now();
