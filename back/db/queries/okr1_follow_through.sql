-- =====================================================================
-- OKR 1 follow-through: did "Yes, I'd make it" turn into a plan?
--
-- Saying yes is only what the user says. This checks what they do next:
-- of the recipes new users said they'd make, how many did they add to
-- their meal plan within 7 days? Shown under OKR 1 on the admin page
-- (src/routes/admin.js). Not part of OKR 1's pass/fail.
-- To run it by hand, replace $1 with the tracking start, e.g.
-- '2026-11-16T00:00:00-07:00'.
--
--   Yes:      a user created on or after $1 answered "Yes, I'd make it"
--             (save_intent_answered, answer 'yes') for a recipe. Counted
--             once per user and recipe, from their first yes.
--   Planned:  an add_to_calendar_completed for that same recipe, by that
--             user, within 7 days after the yes. From anywhere in the app.
--   Waiting:  said yes under 7 days ago and not planned yet.
--
-- follow_through_rate only uses yeses from at least 7 days ago, whose
-- window is over. Including recent ones would make the rate look high
-- early on, since a plan shows up right away but a "never planned" takes
-- the full 7 days to be sure of.
--
-- Returns one row: said_yes (all yes recipes), planned (within 7 days, so
-- far), waiting, window_closed (yeses from 7+ days ago), planned_closed
-- (those that were planned), follow_through_rate (0-100) and
-- median_seconds (yes to planned, for everything planned).
-- =====================================================================

with said_yes as (
  select a.user_id,
         a.metadata ->> 'recipe_id' as recipe_id,
         min(a.created_at) as said_yes_at
  from events a
  join users u on u.user_id = a.user_id
  where a.event_name = 'save_intent_answered'
    and a.metadata ->> 'answer' = 'yes'
    and u.created_at >= $1::timestamptz
  group by a.user_id, a.metadata ->> 'recipe_id'
),

with_plan as (
  select y.*,
         (select min(c.created_at)
          from events c
          where c.user_id = y.user_id
            and c.event_name = 'add_to_calendar_completed'
            and c.metadata ->> 'recipe_id' = y.recipe_id
            and c.created_at >= y.said_yes_at
            and c.created_at <= y.said_yes_at + interval '7 days') as planned_at,
         now() >= y.said_yes_at + interval '7 days' as window_closed
  from said_yes y
)

select count(*)::int as said_yes,
       count(planned_at)::int as planned,
       count(*) filter (where planned_at is null and not window_closed)::int as waiting,
       count(*) filter (where window_closed)::int as window_closed,
       count(planned_at) filter (where window_closed)::int as planned_closed,
       round(100.0 * count(planned_at) filter (where window_closed)
             / nullif(count(*) filter (where window_closed), 0), 1)::float as follow_through_rate,
       percentile_cont(0.5) within group (order by extract(epoch from planned_at - said_yes_at)) as median_seconds
from with_plan;
