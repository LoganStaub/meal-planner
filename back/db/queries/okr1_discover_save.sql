-- =====================================================================
-- OKR 1: new users find and save a recipe they'd want to try, within
-- 3 minutes, on the Discover screen (the Home swipe feed)
--
-- Target: at least 80% (8 of 10) of new users.
-- Used by the admin page (src/routes/admin.js). To run it by hand, replace
-- $1 with the tracking start, e.g. '2026-11-16T00:00:00-07:00'.
--
--   Eligible:  a user created on or after $1 (OKR_TRACKING_START) who has
--              opened the Home feed at least once
--   Start:     their first-ever discover_viewed (front/public/js/index.js)
--   Save:      a recipe_saved with source 'discover', logged by the server
--              when a like is really new (src/routes/likes.js)
--   Pass:      a save within 3 minutes of the start, and the user answered
--              "Yes, I'd make it" for that recipe (save_intent_answered,
--              answer 'yes'). The answer can come after the 3 minutes.
--   Fail:      anything else once the 3 minutes are up. The kinds of fail:
--                said_no:     saved in time, but answered "Not really"
--                no_answer:   saved in time, never answered
--                too_slow:    only saved after the 3 minutes
--                never_saved: no save from the feed at all
--   Pending:   started under 3 minutes ago and not passed yet. Left out of
--              the pass rate, but counted in in_progress.
--
-- Unliking later doesn't undo a pass: the save is counted from events.
--
-- Returns one row: eligible (not counting in progress), passes, fails,
-- pass_rate (0-100), said_no, no_answer, too_slow and never_saved (they add
-- up to fails), in_progress, and median_seconds (start to the first saved
-- recipe they said yes to, for passes).
-- =====================================================================

with first_view as (
  select distinct on (e.user_id)
         e.user_id,
         e.created_at as started_at
  from events e
  join users u on u.user_id = e.user_id
  where e.event_name = 'discover_viewed'
    and u.created_at >= $1::timestamptz
  order by e.user_id, e.created_at, e.id
),

-- Saves from the feed, with whether each one was in the 3 minutes
saves as (
  select f.user_id,
         s.created_at as saved_at,
         s.metadata ->> 'recipe_id' as recipe_id,
         s.created_at <= f.started_at + interval '3 minutes' as in_time
  from first_view f
  join events s
    on s.user_id = f.user_id
   and s.event_name = 'recipe_saved'
   and s.metadata ->> 'source' = 'discover'
   and s.created_at >= f.started_at
),

-- Each in-time save with the first answer given for that recipe after it
answered as (
  select sv.*,
         (select a.metadata ->> 'answer'
          from events a
          where a.user_id = sv.user_id
            and a.event_name = 'save_intent_answered'
            and a.metadata ->> 'recipe_id' = sv.recipe_id
            and a.created_at >= sv.saved_at
          order by a.created_at, a.id
          limit 1) as answer
  from saves sv
  where sv.in_time
),

per_user as (
  select f.user_id,
         f.started_at,
         (select min(a.saved_at) from answered a
          where a.user_id = f.user_id and a.answer = 'yes') as passed_at,
         exists (select 1 from answered a
                 where a.user_id = f.user_id and a.answer = 'no') as said_no,
         exists (select 1 from answered a where a.user_id = f.user_id) as saved_in_time,
         exists (select 1 from saves sv
                 where sv.user_id = f.user_id and not sv.in_time) as saved_late
  from first_view f
),

outcomes as (
  select extract(epoch from passed_at - started_at) as seconds,
         case
           when passed_at is not null then 'pass'
           when now() < started_at + interval '3 minutes' then 'in_progress'
           when said_no then 'said_no'
           when saved_in_time then 'no_answer'
           when saved_late then 'too_slow'
           else 'never_saved'
         end as outcome
  from per_user
)

select count(*) filter (where outcome <> 'in_progress')::int as eligible,
       count(*) filter (where outcome = 'pass')::int as passes,
       count(*) filter (where outcome not in ('pass', 'in_progress'))::int as fails,
       round(100.0 * count(*) filter (where outcome = 'pass')
             / nullif(count(*) filter (where outcome <> 'in_progress'), 0), 1)::float as pass_rate,
       count(*) filter (where outcome = 'said_no')::int as said_no,
       count(*) filter (where outcome = 'no_answer')::int as no_answer,
       count(*) filter (where outcome = 'too_slow')::int as too_slow,
       count(*) filter (where outcome = 'never_saved')::int as never_saved,
       count(*) filter (where outcome = 'in_progress')::int as in_progress,
       percentile_cont(0.5) within group (order by seconds) filter (where outcome = 'pass') as median_seconds
from outcomes;
