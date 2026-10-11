// Example queries the frontend can copy from.
// Table and column names are snake_case (see supabase/schema.sql).
import { supabase } from './supabaseClient.js'

// All recipes, with their class name joined in
export async function getRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('recipe_id, recipe_title, cost, prep_time, liked, recipe_classes(recipe_class_desc)')
    .order('recipe_title')
  if (error) throw error
  return data
}

// One recipe with its ingredient list (in order)
export async function getRecipeWithIngredients(recipeId) {
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients (
        recipe_seq_number, amount,
        ingredients ( ingredient_name ),
        measurements ( measurement_desc )
      )
    `)
    .eq('recipe_id', recipeId)
    .order('recipe_seq_number', { referencedTable: 'recipe_ingredients' })
    .single()
  if (error) throw error
  return data
}

// Add a recipe
export async function addRecipe(recipe) {
  // recipe = { recipe_title, recipe_class_id, cost, prep_time, macros, instructions }
  const { data, error } = await supabase.from('recipes').insert(recipe).select().single()
  if (error) throw error
  return data
}

// A logged-in user's meal plan between two dates ('YYYY-MM-DD')
// (Requires the user to be signed in via supabase.auth — see README)
export async function getMealPlan(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('calendar')
    .select('date, meal_slot, recipes(recipe_id, recipe_title)')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('meal_slot')
  if (error) throw error
  return data
}
