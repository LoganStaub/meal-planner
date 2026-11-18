-- =====================================================================
-- 015: recipes.image_path (a photo for each recipe)
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- The Home page's daily picks (src/routes/dailyPicks.js) show this as the
-- card's photo; recipes without one fall back to a plain background.
-- It holds a full URL or a path under front/public (e.g. /images/recipes/3.jpg).
--
-- The shared Neon database already has this column (it was added there by
-- hand), so on that database this does nothing. It's here so brand-new
-- databases get it too.
--
-- Only ADDS a column; nothing existing changes. Safe to run more than once.
-- =====================================================================

alter table recipes
  add column if not exists image_path text;
