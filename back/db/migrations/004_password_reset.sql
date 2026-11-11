-- =====================================================================
-- 004: forgot password / reset password
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- "Forgot password?" emails a link. Each link is one row here until it is
-- used or replaced. Only ADDS to the database. Safe to run more than once.
-- =====================================================================

create table if not exists password_reset_tokens (
  -- SHA-256 hash of the token in the emailed link (the token itself is never stored)
  token_hash  text primary key,
  user_id     int not null references users (user_id) on delete cascade,
  created_at  timestamptz not null default now(),   -- used for the resend cooldown
  expires_at  timestamptz not null
);

create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens (user_id);
create index if not exists password_reset_tokens_expires_at_idx on password_reset_tokens (expires_at);
