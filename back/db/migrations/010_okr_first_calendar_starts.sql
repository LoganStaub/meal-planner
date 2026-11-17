-- =====================================================================
-- 010: shared "new user's first add to calendar" function for the OKRs
--
-- HOW TO RUN:  npm run db:migrate   (from back/)
--
-- OKR 3 (db/queries/okr3_first_try.sql) and OKR 4
-- (db/queries/okr4_three_day_plan.sql) both start from the same thing:
-- each NEW user's first-ever add_to_calendar_started event. Defining it
-- once here keeps the two OKRs counting the same people.
--
--   select * from new_user_first_calendar_starts('2026-11-16T00:00:00-07:00')
--   -> user_id, started_at, entry_point
--
-- New user: created on or after tracking_start (OKR_TRACKING_START).
-- Users created before created_at existed have NULL and never count.
--
-- Only ADDS a function; nothing existing changes. Safe to run more than once.
-- =====================================================================

create or replace function new_user_first_calendar_starts(tracking_start timestamptz)
returns table (user_id int, started_at timestamptz, entry_point text)
language sql
stable
as $$
  select distinct on (e.user_id)
         e.user_id,
         e.created_at,
         coalesce(e.metadata ->> 'entry_point', 'unknown')
  from events e
  join users u on u.user_id = e.user_id
  where e.event_name = 'add_to_calendar_started'
    and u.created_at >= tracking_start
  order by e.user_id, e.created_at, e.id
$$;
