-- =====================================================================
-- 011: profile icon color
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- The color behind a user's initials. null shows the default orange.
-- The app only saves colors from src/avatarColors.js; the check just
-- keeps the column to a #rrggbb value. Safe to run more than once.
-- =====================================================================

alter table users
  add column if not exists avatar_color text
  check (avatar_color ~ '^#[0-9a-f]{6}$');
