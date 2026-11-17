-- =====================================================================
-- OKR 4: new users plan meals on 3 different days within 5 minutes
--
-- Target: at least 80% of new users schedule at least one meal on 3
-- different days within 5 minutes of starting to plan.
-- Used by the admin page (src/routes/admin.js). To run it by hand, replace
-- $1 with the tracking start, e.g. '2026-11-16T00:00:00-07:00'.
--
--   Eligible:    a user created on or after $1 (OKR_TRACKING_START) who has
--                started adding to the calendar at least once
--   Start:       their first-ever add_to_calendar_started (same as OKR 3,
--                from new_user_first_calendar_starts in migration 010)
--   Finish:      the add_to_calendar_completed that brings them to 3
--                distinct planned_date values, counting only completed
--                events at or after the start. Several meals on one day
--                count as one day. Counted from events, not the calendar
--                table, so deleting a meal later doesn't undo progress.
--   Pass:        finish within 5 minutes of the start
--   Fail:        finish after 5 minutes ("too slow"), or never reached 3
--                days and the start was more than 5 minutes ago ("never
--                reached")
--   In progress: started under 5 minutes ago and hasn't passed yet. Left
--                out of the pass rate, but counted in in_progress.
--
-- planned_date is logged as 'YYYY-MM-DD' (src/routes/calendar.js). It is
-- still cut to its first 10 characters and cast to a date, so a value with
-- a time on it would count as the same day.
--
-- Returns one row: eligible (not counting in progress), passes, fails,
-- pass_rate (0-100), too_slow and never_reached (the two kinds of fail;
-- they add up to fails), in_progress, and median_seconds (start to the
-- 3rd day, for everyone who reached 3 days, including the too slow).
-- =====================================================================

with first_start as (
  select * from new_user_first_calendar_starts($1::timestamptz)
),

-- When each distinct planned day was first completed after the start
planned_days as (
  select f.user_id,
         left(c.metadata ->> 'planned_date', 10)::date as planned_day,
         min(c.created_at) as first_completed_at
  from first_start f
  join events c
    on c.user_id = f.user_id
   and c.event_name = 'add_to_calendar_completed'
   and c.created_at >= f.started_at
  where c.metadata ->> 'planned_date' ~ '^\d{4}-\d{2}-\d{2}'
  group by f.user_id, planned_day
),

-- The moment each user reached their 3rd distinct day
third_day as (
  select user_id, first_completed_at as reached_at
  from (
    select user_id, first_completed_at,
           row_number() over (partition by user_id order by first_completed_at) as day_number
    from planned_days
  ) numbered
  where day_number = 3
),

outcomes as (
  select f.user_id,
         extract(epoch from t.reached_at - f.started_at) as seconds,
         case
           when t.reached_at <= f.started_at + interval '5 minutes' then 'pass'
           when t.reached_at is not null then 'fail'
           when now() >= f.started_at + interval '5 minutes' then 'fail'
           else 'in_progress'
         end as outcome
  from first_start f
  left join third_day t on t.user_id = f.user_id
)

select count(*) filter (where outcome <> 'in_progress')::int as eligible,
       count(*) filter (where outcome = 'pass')::int as passes,
       count(*) filter (where outcome = 'fail')::int as fails,
       round(100.0 * count(*) filter (where outcome = 'pass')
             / nullif(count(*) filter (where outcome <> 'in_progress'), 0), 1)::float as pass_rate,
       count(*) filter (where outcome = 'fail' and seconds is not null)::int as too_slow,
       count(*) filter (where outcome = 'fail' and seconds is null)::int as never_reached,
       count(*) filter (where outcome = 'in_progress')::int as in_progress,
       percentile_cont(0.5) within group (order by seconds) as median_seconds
from outcomes;
