// Run with:  npm run db:seed
// Adds a test user (user_id 1) and a few planned meals this week, so the
// calendar page at http://localhost:3000/calendar has something to show.
//
// Safe to run more than once: it never deletes anything, and it skips any
// recipe that's already planned for that day and meal.
import { pool } from '../src/db.js'

const TEST_USER = { user_id: 1, first_name: 'Test', last_name: 'User', email: 'test.user@example.com' }

// Only used if the recipes table is empty
const SAMPLE_RECIPES = [
  { title: 'Greek Yogurt Parfait', class: 'Breakfast', prep_time: 5 },
  { title: 'Chicken Caesar Wrap', class: 'Lunch', prep_time: 15 },
  { title: 'Sheet Pan Salmon and Veggies', class: 'Dinner', prep_time: 30 },
]

// 'YYYY-MM-DD' in local time, the same way the calendar page builds its dates
function dateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// Day `offset` of the current Sunday–Saturday week (0 = Sunday)
function dayOfThisWeek(offset) {
  const date = new Date()
  date.setDate(date.getDate() - date.getDay() + offset)
  return dateKey(date)
}

const client = await pool.connect()
try {
  await client.query('begin')

  // ---------- Test user ----------
  const existingUser = await client.query('select user_id, email from users where user_id = $1', [TEST_USER.user_id])
  if (existingUser.rows.length > 0) {
    console.log(`User ${TEST_USER.user_id} already exists (${existingUser.rows[0].email}), using it.`)
  } else {
    // user_id is an identity column, so inserting a specific id needs OVERRIDING SYSTEM VALUE
    await client.query(
      `insert into users (user_id, first_name, last_name, email)
       overriding system value
       values ($1, $2, $3, $4)`,
      [TEST_USER.user_id, TEST_USER.first_name, TEST_USER.last_name, TEST_USER.email]
    )
    // Move the identity sequence past it so the next normal insert doesn't reuse id 1
    await client.query(
      `select setval(pg_get_serial_sequence('users', 'user_id'),
                     (select max(user_id) from users))`
    )
    console.log(`Created user ${TEST_USER.user_id} (${TEST_USER.email}).`)
  }

  // ---------- Recipes ----------
  let { rows: recipes } = await client.query(
    'select recipe_id, recipe_title from recipes order by recipe_id limit 6'
  )
  if (recipes.length === 0) {
    for (const recipe of SAMPLE_RECIPES) {
      await client.query(
        `insert into recipes (recipe_title, recipe_class_id, prep_time)
         values ($1, (select recipe_class_id from recipe_classes where recipe_class_desc = $2 limit 1), $3)`,
        [recipe.title, recipe.class, recipe.prep_time]
      )
    }
    ;({ rows: recipes } = await client.query(
      'select recipe_id, recipe_title from recipes order by recipe_id limit 6'
    ))
    console.log(`No recipes found, so added ${recipes.length} sample recipes.`)
  }

  // ---------- Calendar ----------
  // [day of week (0 = Sunday), meal slot]
  // Slots: 1 = Breakfast, 2 = Lunch, 3 = Dinner, 4 = Snack, 5 = Dessert
  const plan = [
    [1, 1], [1, 3],                  // Monday: breakfast, dinner
    [2, 2],                          // Tuesday: lunch
    [3, 1], [3, 2], [3, 3], [3, 3],  // Wednesday: all three, with two dinner dishes
    [5, 3], [5, 5],                  // Friday: dinner and dessert
  ]

  let added = 0
  for (const [index, [day, slot]] of plan.entries()) {
    const recipe = recipes[index % recipes.length]
    const { rowCount } = await client.query(
      `insert into calendar (user_id, date, meal_slot, recipe_id)
       values ($1, $2::date, $3, $4)
       on conflict (user_id, date, meal_slot, recipe_id) do nothing`,
      [TEST_USER.user_id, dayOfThisWeek(day), slot, recipe.recipe_id]
    )
    if (rowCount > 0) {
      added += 1
      console.log(`  ${dayOfThisWeek(day)}  slot ${slot}  ${recipe.recipe_title}`)
    }
  }

  await client.query('commit')
  console.log(`✅ Added ${added} planned meal(s) for user ${TEST_USER.user_id}` +
    (added < plan.length ? ` (${plan.length - added} were already planned).` : '.'))
} catch (error) {
  await client.query('rollback')
  console.error('❌ Could not seed the calendar:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
