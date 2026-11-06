-- =====================================================================
-- 003: accounts are only created after the email is verified
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Signup now saves the form in pending_signups and emails a link. The
-- users row is only created when that link is used. Unverified signups
-- never become users, and are deleted once their link expires.
-- =====================================================================

create table if not exists pending_signups (
  -- SHA-256 hash of the token in the emailed link (the token itself is never stored)
  token_hash     text primary key,
  first_name     text not null,
  last_name      text not null,
  email          text not null,
  password_hash  text not null,     -- bcrypt hash, same as users.password_hash
  phone          text,
  created_at     timestamptz not null default now(),   -- when the latest email was sent
  expires_at     timestamptz not null
);

-- One waiting signup per email; signing up again replaces it.
create unique index if not exists pending_signups_email_idx on pending_signups (lower(email));
create index if not exists pending_signups_expires_at_idx on pending_signups (expires_at);

-- Replaced by pending_signups. This table was added in 002 on this branch
-- only, and its links pointed at users rows that now won't exist until
-- verification.
drop table if exists email_verification_tokens;

-- users.email_verified_at (from 002) stays: new users get it set when they
-- verify, and existing users were already marked verified.
