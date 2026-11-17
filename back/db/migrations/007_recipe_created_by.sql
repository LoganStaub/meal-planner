-- =====================================================================
-- 007: who added each recipe, and when
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Used by the Search page's "Add a recipe with AI" assistant
-- (src/routes/recipeAssistant.js):
--   * created_by: the user who added the recipe. Null for recipes added
--     before this (the seeded ones) and for recipes added by scripts.
--     If that user's account is deleted, the recipe stays and created_by
--     becomes null.
--   * created_at: when it was added. Existing recipes get the time this
--     migration ran.
-- The daily limit (3 recipes per user per day) counts these columns.
--
-- Only ADDS two columns and an index; nothing existing changes.
-- Safe to run more than once.
-- =====================================================================

alter table recipes
  add column if not exists created_by int references users (user_id) on delete set null;

alter table recipes
  add column if not exists created_at timestamptz not null default now();

-- "How many recipes did this user add today?"
create index if not exists recipes_created_by_created_at_idx on recipes (created_by, created_at);
