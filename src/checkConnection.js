// Run with:  npm run check
// Confirms your .env is right and the database is reachable.
import { supabase } from './supabaseClient.js'

const { data, error } = await supabase
  .from('recipe_classes')
  .select('recipe_class_id, recipe_class_desc')

if (error) {
  console.error('❌ Could not reach the database:', error.message)
  process.exit(1)
}

console.log('✅ Connected to Supabase. Recipe classes:')
console.table(data)
