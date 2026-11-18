-- =====================================================================
-- 014: items removed from the shopping list
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- The shopping list isn't stored: it's worked out from the next 7 days of
-- the meal plan, minus the pantry (src/routes/shopping.js). So "remove this
-- item" is saved as "don't list this ingredient for this planned dish".
--
--   One row = one planned dish (calendar_id) + one of its ingredients.
--
-- If the user plans another dish that needs the same ingredient, that dish
-- has a new calendar_id, so the item comes back (for that dish only).
-- Removing the dish from the meal plan deletes its rows here too.
--
-- Only ADDS a table; nothing existing changes. Safe to run more than once.
-- =====================================================================

create table if not exists user_shopping_removed (
  calendar_id    int not null references calendar (calendar_id) on delete cascade,
  ingredient_id  int not null references ingredients (ingredient_id) on delete cascade,
  user_id        int not null references users (user_id) on delete cascade,
  removed_at     timestamptz not null default now(),
  primary key (calendar_id, ingredient_id)
);

create index if not exists user_shopping_removed_user_id_idx
  on user_shopping_removed (user_id);
