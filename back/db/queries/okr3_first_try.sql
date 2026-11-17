-- =====================================================================
-- OKR 3: new users add a recipe to their calendar on the first try
--
-- Target: at least 80% of new users succeed on their first attempt.
-- Used by the admin page (src/routes/admin.js). To run it by hand, replace
-- $1 with the tracking start, e.g. '2026-11-16T00:00:00-07:00'.
--
--   Eligible:  a user created on or after $1 (OKR_TRACKING_START) who has
--              started adding to the calendar at least once
--   Attempt:   their first-ever add_to_calendar_started event
--   Pass:      an add_to_calendar_completed within 2 minutes of that start,
--              with no cancel, error or help event between the start and
--              the completion
--   Fail:      anything else, including never finishing
--   Pending:   started under 2 minutes ago and not decided yet. Left out
--              until it is, so someone mid-attempt isn't counted as a fail.
--
-- Returns one row for everyone (is_total = true) and one per entry point
-- (where the first attempt started): eligible, passes, fails, pass_rate
-- (0-100) and median_seconds (the passes' median time to complete).
-- =====================================================================

with first_start as (
  -- Each new user's first add_to_calendar_started (shared with OKR 4,
  -- see db/migrations/010_okr_first_calendar_starts.sql)
  select * from new_user_first_calendar_starts($1::timestamptz)
),

attempts as (
  select f.*,
         (select min(c.created_at)
          from events c
          where c.user_id = f.user_id
            and c.event_name = 'add_to_calendar_completed'
            and c.created_at >= f.started_at) as completed_at,
         (select min(p.created_at)
          from events p
          where p.user_id = f.user_id
            and p.event_name in ('add_to_calendar_cancelled', 'add_to_calendar_error', 'help_opened')
            and p.created_at >= f.started_at) as problem_at
  from first_start f
),

outcomes as (
  select entry_point,
         extract(epoch from completed_at - started_at) as seconds,
         case
           -- finished in time, and nothing went wrong first
           when completed_at <= started_at + interval '2 minutes'
                and (problem_at is null or problem_at > completed_at) then 'pass'
           -- cancelled, hit an error or opened help before finishing
           when problem_at is not null then 'fail'
           -- the 2 minutes are up (finished late, or never finished)
           when now() >= started_at + interval '2 minutes' then 'fail'
           else 'pending'
         end as outcome
  from attempts
)

select grouping(entry_point) = 1 as is_total,
       entry_point,
       count(*)::int as eligible,
       count(*) filter (where outcome = 'pass')::int as passes,
       count(*) filter (where outcome = 'fail')::int as fails,
       round(100.0 * count(*) filter (where outcome = 'pass') / nullif(count(*), 0), 1)::float as pass_rate,
       percentile_cont(0.5) within group (order by seconds) filter (where outcome = 'pass') as median_seconds
from outcomes
where outcome <> 'pending'
group by grouping sets ((), (entry_point))
order by is_total desc, eligible desc, entry_point;
