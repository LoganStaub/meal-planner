// The Home page's daily picks: /api/me/daily-picks
//
// Every user gets 5 recipes a day. They are chosen by sorting all recipes on a
// hash of (recipe, today's date, user), so the same user sees the same 5
// recipes all day (refreshing doesn't reshuffle) and gets a new set at
// midnight in the app's time zone. Recipes the user liked on an earlier day
// are skipped; ones liked today stay, so the list doesn't change when they
// tap the heart.
//
// Each item has the fields js/index.js uses: recipe_id, recipe_title,
// prep_time, recipe_class_desc, image_url, image_srcset, liked, rating_avg, rating_count,
// ingredient_count, in_pantry, to_buy and description.
import { Router } from 'express'
import { pool } from '../db.js'
import { APP_TIME_ZONE } from '../canRate.js'
import { srcsetList } from '../assets.js'

const router = Router()

const PICKS_PER_DAY = 5

// The recipes table has no description column yet, so the card shows
// "Made with a, b, c and d" from the first few ingredients.
function describeIngredients(names) {
  const firstFew = names.slice(0, 4)
  if (firstFew.length === 0) return ''
  if (firstFew.length === 1) return `Made with ${firstFew[0]}.`
  return `Made with ${firstFew.slice(0, -1).join(', ')} and ${firstFew.at(-1)}.`
}

// GET /api/me/daily-picks  -> up to 5 recipes for today
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `with today as (
       select (now() at time zone $2::text)::date as day
     )
     select r.recipe_id,
            r.recipe_title,
            r.prep_time,
            rc.recipe_class_desc,
            r.image_path as image_url,
            exists (
              select 1 from user_liked_recipes ul
              where ul.recipe_id = r.recipe_id and ul.user_id = $1
            ) as liked,
            rs.rating_avg::float as rating_avg,
            coalesce(rs.rating_count, 0) as rating_count,
            pantry.ingredient_count, pantry.ingredient_names, pantry.in_pantry, pantry.to_buy
     from recipes r
     cross join today
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     left join recipe_rating_stats rs on rs.recipe_id = r.recipe_id
     cross join lateral (
       select count(*)::int as ingredient_count,
              coalesce(array_agg(i.ingredient_name order by ri.recipe_seq_number), '{}') as ingredient_names,
              coalesce(
                array_agg(i.ingredient_name order by ri.recipe_seq_number)
                  filter (where up.pantry_amount_id in (0, 1)),
                '{}'
              ) as in_pantry,
              (count(*) filter (where up.pantry_amount_id is null or up.pantry_amount_id = 2))::int as to_buy
       from recipe_ingredients ri
       join ingredients i on i.ingredient_id = ri.ingredient_id
       left join user_pantry up on up.ingredient_id = ri.ingredient_id and up.user_id = $1
       where ri.recipe_id = r.recipe_id
     ) pantry
     where not exists (
       select 1 from user_liked_recipes ul
       where ul.recipe_id = r.recipe_id
         and ul.user_id = $1
         and ul.liked_at < today.day::timestamp at time zone $2::text
     )
     order by md5(r.recipe_id::text || today.day::text || ($1::int)::text), r.recipe_id
     limit $3`,
    [req.user.user_id, APP_TIME_ZONE, PICKS_PER_DAY]
  )

  res.json(
    rows.map(({ ingredient_names, ...recipe }) => ({
      ...recipe,
      image_srcset: srcsetList(recipe.image_url),
      description: describeIngredients(ingredient_names),
    }))
  )
})

export default router