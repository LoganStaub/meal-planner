-- =====================================================================
-- 002: seed a test user with user_id 1
--
-- There's no login yet, so the frontend uses USER_ID = 1 everywhere
-- (e.g. calendar.html). This makes sure that user exists.
-- Safe to run more than once: it skips the insert if user 1 (or the
-- email) already exists.
--
-- HOW TO RUN:  psql "$DATABASE_URL" -f db/002_seed_test_user.sql
--   (or paste into pgAdmin's Query Tool)
-- New setups get this from db/schema.sql automatically.
-- =====================================================================

-- user_id is "generated always", so a fixed ID needs OVERRIDING SYSTEM VALUE
insert into users (user_id, first_name, last_name, email)
overriding system value
values (1, 'Test', 'User', 'test.user@example.com')
on conflict do nothing;

-- Move the identity sequence past user 1 so the next normal insert
-- doesn't also try to use user_id 1
select setval(pg_get_serial_sequence('users', 'user_id'),
              (select max(user_id) from users));
