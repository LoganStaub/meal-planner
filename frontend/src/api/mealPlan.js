// Meal plan (calendar) queries.
import { supabase } from '../lib/supabase.js'

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
