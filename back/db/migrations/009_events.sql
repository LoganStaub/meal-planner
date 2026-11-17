-- =====================================================================
-- 009: events, a general log of things users do
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- Used to measure OKRs (see src/routes/admin.js). Any feature can log to
-- it, from the server with logEvent() in src/events.js or from a page with
-- window.logEvent() in front/public/js/events.js (only names listed in
-- CLIENT_EVENTS in src/events.js are accepted from pages).
--
--   event_name: what happened, e.g. 'add_to_calendar_started'
--   metadata:   anything else about it, e.g. { "entry_point": "home_card" }
--
-- Deleting a user deletes their events.
-- Only ADDS a table; nothing existing changes. Safe to run more than once.
-- =====================================================================

create table if not exists events (
  id          serial primary key,
  user_id     int references users (user_id) on delete cascade,
  event_name  text not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- "This user's first X", "everything this user did after X"
create index if not exists events_user_id_event_name_created_at_idx
  on events (user_id, event_name, created_at);
