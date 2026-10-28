// Run with:  npm run check
// Confirms your .env is right and the database is reachable.
// Runs in Node (not the browser), so it builds its own client from frontend/.env.
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('recipe_classes')
  .select('recipe_class_id, recipe_class_desc')

if (error) {
  console.error('❌ Could not reach the database:', error.message)
  process.exit(1)
}

console.log('✅ Connected to Supabase. Recipe classes:')
console.table(data)
