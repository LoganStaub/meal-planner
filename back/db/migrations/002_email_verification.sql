-- =====================================================================
-- 002: email verification
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- New accounts must click a link sent to their email before they can log in.
-- Only ADDS to the database. Safe to run more than once.
-- =====================================================================

-- null = not verified yet
alter table users add column if not exists email_verified_at timestamptz;

-- Accounts that existed before verification was added count as verified,
-- so nobody gets locked out.
update users set email_verified_at = now() where email_verified_at is null;

-- One row per verification link that has been sent. Only a SHA-256 hash of
-- the link's token is stored, so someone who can read this table still
-- can't verify an account. A row is deleted as soon as its link is used.
create table if not exists email_verification_tokens (
  token_hash  text primary key,
  user_id     int not null references users (user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists email_verification_tokens_user_id_idx on email_verification_tokens (user_id);
