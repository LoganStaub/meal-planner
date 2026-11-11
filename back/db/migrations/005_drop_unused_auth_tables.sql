-- =====================================================================
-- 005: drop tables the app no longer uses
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- * pending_signups (from 003): signup now creates the users row right
--   away, with no email verification step.
-- * session (from 001): login sessions are stored in Redis now
--   (see src/redis.js), not in Postgres.
-- * password_reset_tokens (from 004): reset links are stored in Redis now.
--
-- All three only held temporary data. Safe to run more than once.
-- =====================================================================

drop table if exists pending_signups;
drop table if exists session;
drop table if exists password_reset_tokens;
