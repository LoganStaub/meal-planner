// Recipe queries. Pages import these instead of calling supabase directly.
// Table and column names are snake_case (see supabase/schema.sql).
import { supabase } from '../lib/supabase.js'

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
