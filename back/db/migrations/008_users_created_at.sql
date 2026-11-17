-- =====================================================================
-- 008: when each user account was created
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- users had no created_at, so there was no way to tell new users from
-- old ones. The OKR numbers on the admin page (src/routes/admin.js) only
-- count users created on or after OKR_TRACKING_START.
--
-- Existing users get NULL, not the time this runs: we don't know when they
-- signed up, and giving them "now" would make them look like new users.
-- Every account created from now on gets the time it was created.
--
-- Only ADDS a column; nothing existing changes. Safe to run more than once.
-- =====================================================================

alter table users add column if not exists created_at timestamptz;

-- Set the default separately so the rows already there stay NULL
alter table users alter column created_at set default now();
