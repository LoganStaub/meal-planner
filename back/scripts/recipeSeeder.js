// Shared by the recipe seed scripts (seedRecipes.js, seedClassicRecipes.js).
// Adds each recipe with its class, cost, prep time, macros, numbered
// instructions and ordered ingredient list, all in one transaction.
//
// Safe to run more than once: a recipe whose title already exists is skipped,
// and ingredients are reused by name (ignoring case) instead of duplicated.
//
// Recipe shape:
//   { title, class: 'Dinner', cost, prep_time, macros, instructions: ['step', ...],
//     ingredients: [{ name, amount: '1/2', measure: 'Cup', in_pantry }, ...] }
// class must match recipe_classes and measure must match measurements.
//
// New ingredients are added with a pantry status:
//   in_pantry: true  -> 0 (plenty left)
//   in_pantry: false -> 2 (none, so it shows up as something to buy)
import { pool } from '../src/db.js'

export async function seedRecipes(recipes) {
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

    async function ingredientId({ name, measure, in_pantry }) {
      const existing = await client.query(
        'select ingredient_id from ingredients where lower(ingredient_name) = lower($1) order by ingredient_id limit 1',
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
    for (const recipe of recipes) {
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
      (added < recipes.length ? `, skipped ${recipes.length - added} that already existed.` : '.'))
  } catch (error) {
    await client.query('rollback')
    console.error('❌ Could not seed recipes:', error.message)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}
