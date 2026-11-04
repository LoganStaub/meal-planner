// Run with:  npm run db:seed-recipes
// Adds 5 complete recipes (class, cost, prep time, macros, instructions and an
// ordered ingredient list). They are the same 5 meals the home page shows as
// placeholders, so on a fresh database they get recipe_id 1-5 to match.
//
// Safe to run more than once: a recipe whose title already exists is skipped,
// and ingredients are reused by name instead of duplicated.
//
// Ingredients double as the pantry. New ones are added with a pantry status:
// in_pantry: true  -> 0 (plenty left)
// in_pantry: false -> 2 (none, so it shows up as something to buy)
import { pool } from '../src/db.js'

const RECIPES = [
  {
    title: 'Smoky chicken & red onion flatbread',
    class: 'Dinner',
    cost: 14.5,
    prep_time: 35,
    macros: 'Per serving (serves 4): 520 kcal | Protein 34g | Carbs 48g | Fat 20g',
    instructions: [
      'Preheat the oven to 450°F (230°C) and line a baking sheet with parchment.',
      'Toss the chicken with 1 tbsp olive oil, the smoked paprika, garlic powder and a pinch of salt.',
      'Sear the chicken in a hot skillet for 5-6 minutes per side until cooked through, then slice thinly.',
      'Stretch the pizza dough into a large oval on the baking sheet and brush with the remaining olive oil.',
      'Spread the BBQ sauce over the dough, then top with the mozzarella, sliced chicken and red onion.',
      'Bake for 12-15 minutes until the edges are crisp and the cheese is bubbling.',
      'Scatter the chopped cilantro over the top, slice and serve.',
    ],
    ingredients: [
      { name: 'Chicken breast', amount: '1', measure: 'Pound', in_pantry: false },
      { name: 'Pizza dough', amount: '1', measure: 'Pound', in_pantry: false },
      { name: 'Red onion', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Mozzarella', amount: '2', measure: 'Cup', in_pantry: true },
      { name: 'BBQ sauce', amount: '1/2', measure: 'Cup', in_pantry: true },
      { name: 'Olive oil', amount: '2', measure: 'Tablespoon', in_pantry: true },
      { name: 'Smoked paprika', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'Garlic powder', amount: '1/2', measure: 'Teaspoon', in_pantry: true },
      { name: 'Cilantro', amount: '1/4', measure: 'Cup', in_pantry: false },
    ],
  },
  {
    title: 'Basil pesto farfalle with cherry tomatoes',
    class: 'Lunch',
    cost: 8.75,
    prep_time: 20,
    macros: 'Per serving (serves 2): 610 kcal | Protein 19g | Carbs 78g | Fat 25g',
    instructions: [
      'Bring a large pot of salted water to a boil and cook the farfalle until al dente. Save 1/2 cup of the pasta water, then drain.',
      'While the pasta cooks, heat the olive oil in a large skillet over medium-high heat.',
      'Add the cherry tomatoes and cook for 4-5 minutes until they start to burst.',
      'Add the drained pasta, pesto and spinach to the skillet and toss until the spinach wilts.',
      'Loosen with a splash of the reserved pasta water until glossy.',
      'Season with salt and pepper and serve topped with the grated parmesan.',
    ],
    ingredients: [
      { name: 'Farfalle pasta', amount: '8', measure: 'Ounce', in_pantry: true },
      { name: 'Basil pesto', amount: '1/2', measure: 'Cup', in_pantry: false },
      { name: 'Cherry tomatoes', amount: '2', measure: 'Cup', in_pantry: true },
      { name: 'Baby spinach', amount: '2', measure: 'Cup', in_pantry: true },
      { name: 'Olive oil', amount: '1', measure: 'Tablespoon', in_pantry: true },
      { name: 'Parmesan', amount: '1/4', measure: 'Cup', in_pantry: true },
    ],
  },
  {
    title: 'Salmon poke bowl',
    class: 'Dinner',
    cost: 16.0,
    prep_time: 25,
    macros: 'Per serving (serves 2): 640 kcal | Protein 38g | Carbs 62g | Fat 24g',
    instructions: [
      'Rinse the rice and cook it according to the package directions.',
      'Bring a small pot of water to a boil, lower in the eggs and cook for 7 minutes, then move them to cold water and peel.',
      'Whisk the soy sauce, rice vinegar and sesame oil together in a small bowl.',
      'Pat the salmon dry and sear it in a hot pan for 3-4 minutes per side, then cut into cubes and toss with half the sauce.',
      'Divide the rice between two bowls and arrange the salmon, cucumber, corn and red cabbage on top.',
      'Halve the eggs, add them to the bowls and drizzle everything with the remaining sauce.',
    ],
    ingredients: [
      { name: 'Salmon fillet', amount: '12', measure: 'Ounce', in_pantry: false },
      { name: 'Rice', amount: '1', measure: 'Cup', in_pantry: true },
      { name: 'Eggs', amount: '2', measure: 'Each', in_pantry: true },
      { name: 'Cucumber', amount: '1', measure: 'Each', in_pantry: false },
      { name: 'Corn', amount: '1/2', measure: 'Cup', in_pantry: true },
      { name: 'Red cabbage', amount: '1', measure: 'Cup', in_pantry: false },
      { name: 'Soy sauce', amount: '3', measure: 'Tablespoon', in_pantry: true },
      { name: 'Rice vinegar', amount: '1', measure: 'Tablespoon', in_pantry: true },
      { name: 'Sesame oil', amount: '1', measure: 'Teaspoon', in_pantry: true },
    ],
  },
  {
    title: 'Rainbow chickpea Buddha bowl',
    class: 'Lunch',
    cost: 9.25,
    prep_time: 30,
    macros: 'Per serving (serves 2, vegan): 580 kcal | Protein 18g | Carbs 70g | Fat 27g',
    instructions: [
      'Preheat the oven to 425°F (220°C).',
      'Toss the diced sweet potato with 1 tbsp olive oil and a pinch of salt and spread it on one side of a baking sheet.',
      'Pat the chickpeas dry, toss them with the remaining olive oil and the cumin and spread them on the other side.',
      'Roast for 25 minutes, stirring halfway, until the sweet potato is tender and the chickpeas are crispy.',
      'Whisk the tahini with the lemon juice and 2-3 tbsp of water until smooth and pourable.',
      'Divide the kale between two bowls, add the roasted sweet potato and chickpeas, the shredded carrot and the sliced avocado, then drizzle with the lemon-tahini sauce.',
    ],
    ingredients: [
      { name: 'Chickpeas', amount: '15', measure: 'Ounce', in_pantry: true },
      { name: 'Sweet potato', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Avocado', amount: '1', measure: 'Each', in_pantry: false },
      { name: 'Kale', amount: '2', measure: 'Cup', in_pantry: false },
      { name: 'Carrot', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Tahini', amount: '2', measure: 'Tablespoon', in_pantry: true },
      { name: 'Lemon', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Olive oil', amount: '2', measure: 'Tablespoon', in_pantry: true },
      { name: 'Ground cumin', amount: '1', measure: 'Teaspoon', in_pantry: true },
    ],
  },
  {
    title: 'Brioche French toast with berries',
    class: 'Breakfast',
    cost: 7.5,
    prep_time: 15,
    macros: 'Per serving (serves 2): 540 kcal | Protein 16g | Carbs 68g | Fat 22g',
    instructions: [
      'Whisk the eggs, milk, vanilla and cinnamon together in a shallow dish.',
      'Melt half the butter in a large skillet over medium heat.',
      'Dip each brioche slice in the custard for about 10 seconds per side.',
      'Cook the slices for 2-3 minutes per side until golden, adding the rest of the butter as needed.',
      'Top with the sliced banana and blueberries and finish with a drizzle of maple syrup.',
    ],
    ingredients: [
      { name: 'Brioche bread', amount: '4', measure: 'Each', in_pantry: false },
      { name: 'Eggs', amount: '3', measure: 'Each', in_pantry: true },
      { name: 'Milk', amount: '1/2', measure: 'Cup', in_pantry: true },
      { name: 'Vanilla extract', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'Ground cinnamon', amount: '1/2', measure: 'Teaspoon', in_pantry: true },
      { name: 'Butter', amount: '2', measure: 'Tablespoon', in_pantry: true },
      { name: 'Banana', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Blueberries', amount: '1/2', measure: 'Cup', in_pantry: false },
      { name: 'Maple syrup', amount: '2', measure: 'Tablespoon', in_pantry: true },
    ],
  },
]

const client = await pool.connect()
try {
  await client.query('begin')

  // Look up ids by name once, so a typo fails loudly instead of saving null
  const classIds = Object.fromEntries((await client.query(
    'select recipe_class_desc, recipe_class_id from recipe_classes'
  )).rows.map((row) => [row.recipe_class_desc, row.recipe_class_id]))
  const measureIds = Object.fromEntries((await client.query(
    'select measurement_desc, measure_amount_id from measurements'
  )).rows.map((row) => [row.measurement_desc, row.measure_amount_id]))

  // Reuse an ingredient if one with the same name (ignoring case) exists
  async function ingredientId({ name, measure, in_pantry }) {
    const existing = await client.query(
      'select ingredient_id from ingredients where lower(ingredient_name) = lower($1) limit 1',
      [name]
    )
    if (existing.rows.length > 0) return existing.rows[0].ingredient_id

    const { rows } = await client.query(
      `insert into ingredients (ingredient_name, pantry_amount_id, measure_amount_id)
       values ($1, $2, $3) returning ingredient_id`,
      [name, in_pantry ? 0 : 2, measureIds[measure]]
    )
    return rows[0].ingredient_id
  }

  let added = 0
  for (const recipe of RECIPES) {
    const existing = await client.query(
      'select recipe_id from recipes where lower(recipe_title) = lower($1)',
      [recipe.title]
    )
    if (existing.rows.length > 0) {
      console.log(`  skipped  #${existing.rows[0].recipe_id} ${recipe.title} (already exists)`)
      continue
    }

    if (!classIds[recipe.class]) throw new Error(`Unknown recipe class "${recipe.class}"`)
    const { rows } = await client.query(
      `insert into recipes (recipe_title, recipe_class_id, cost, macros, prep_time, instructions)
       values ($1, $2, $3, $4, $5, $6) returning recipe_id`,
      [recipe.title, classIds[recipe.class], recipe.cost, recipe.macros, recipe.prep_time,
        recipe.instructions.map((step, i) => `${i + 1}. ${step}`).join('\n')]
    )
    const recipeId = rows[0].recipe_id

    for (const [index, ingredient] of recipe.ingredients.entries()) {
      if (!measureIds[ingredient.measure]) throw new Error(`Unknown measurement "${ingredient.measure}"`)
      await client.query(
        `insert into recipe_ingredients (recipe_id, recipe_seq_number, ingredient_id, measure_amount_id, amount)
         values ($1, $2, $3, $4, $5)`,
        [recipeId, index + 1, await ingredientId(ingredient), measureIds[ingredient.measure], ingredient.amount]
      )
    }

    added += 1
    console.log(`  added    #${recipeId} ${recipe.title} (${recipe.ingredients.length} ingredients)`)
  }

  await client.query('commit')
  console.log(`✅ Added ${added} recipe(s)` +
    (added < RECIPES.length ? `, skipped ${RECIPES.length - added} that already existed.` : '.'))
} catch (error) {
  await client.query('rollback')
  console.error('❌ Could not seed recipes:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
