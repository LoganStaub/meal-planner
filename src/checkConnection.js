// Run with:  npm run check
// Confirms your .env is right and the database is reachable.
import { pool } from './db.js'

try {
  const { rows } = await pool.query(
    'select recipe_class_id, recipe_class_desc from recipe_classes order by recipe_class_id'
  )
  console.log('✅ Connected to Postgres. Recipe classes:')
  console.table(rows)
} catch (error) {
  console.error('❌ Could not reach the database:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
