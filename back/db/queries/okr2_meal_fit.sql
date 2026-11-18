-- =====================================================================
-- OKR 2: users rate "I found meals I'd actually make" at 4 or higher out
-- of 5 on average
--
-- Used by the admin page (src/routes/admin.js). No parameters.
--
--   Prompt:    after swiping past all 5 meals on Home, at most once per
--              user every 7 days (src/routes/mealFit.js)
--   Rating:    meal_fit_rated, metadata { rating: 1-5 }
--   Dismissed: meal_fit_dismissed, closed without rating
--   Average:   the mean of every rating. Each user can rate at most once a
--              week, so frequent users can't swamp it.
--
-- All users count, not just new ones (the OKR is about everyone).
--
-- Returns one row for all time (is_total = true) and one per week (weeks
-- start on Monday, newest first): prompts, ratings, dismissed, raters
-- (different users who rated), average (1-5), four_plus (ratings of 4 or 5)
-- and stars_1 ... stars_5 (how many of each).
-- =====================================================================

with fit_events as (
  select user_id,
         event_name,
         to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week,
         case when event_name = 'meal_fit_rated' then (metadata ->> 'rating')::int end as rating
  from events
  where event_name in ('meal_fit_prompt_shown', 'meal_fit_rated', 'meal_fit_dismissed')
)

select grouping(week) = 1 as is_total,
       week,
       count(*) filter (where event_name = 'meal_fit_prompt_shown')::int as prompts,
       count(rating)::int as ratings,
       count(*) filter (where event_name = 'meal_fit_dismissed')::int as dismissed,
       count(distinct user_id) filter (where rating is not null)::int as raters,
       round(avg(rating), 2)::float as average,
       count(*) filter (where rating >= 4)::int as four_plus,
       count(*) filter (where rating = 1)::int as stars_1,
       count(*) filter (where rating = 2)::int as stars_2,
       count(*) filter (where rating = 3)::int as stars_3,
       count(*) filter (where rating = 4)::int as stars_4,
       count(*) filter (where rating = 5)::int as stars_5
from fit_events
group by grouping sets ((), (week))
order by is_total desc, week desc;
