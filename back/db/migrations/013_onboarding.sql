-- =====================================================================
-- 013: onboarding (the first-visit tour of the app)
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Remembers whether each account has been offered the tour, so the
-- welcome popup only shows once (src/routes/onboarding.js, js/onboarding.js).
--
--   onboarding_status:  null         not offered yet: the welcome popup shows
--                       'skipped'    said "No thanks"
--                       'started'    began the tour but left partway
--                       'completed'  reached the end of the tour
--   onboarding_updated_at:  when the status last changed
--
-- Any non-null status means "don't offer it again". The tour can still be
-- replayed from the profile menu.
--
-- Existing users get null, so everyone is offered the tour once.
-- To offer it again (e.g. when testing):
--   update users set onboarding_status = null, onboarding_updated_at = null
--   where email = 'someone@example.com';
--
-- Only ADDS columns; nothing existing changes. Safe to run more than once.
-- =====================================================================

alter table users
  add column if not exists onboarding_status text
  check (onboarding_status in ('skipped', 'started', 'completed'));

alter table users
  add column if not exists onboarding_updated_at timestamptz;
