// Run with:  npm run db:init
// Creates all tables and starter data from db/schema.sql.
// WARNING: drops existing tables first, so all data is lost.
import { readFile } from 'node:fs/promises'
import { pool } from '../src/db.js'

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8')

try {
  await pool.query(sql)
  console.log('✅ Database schema created.')
} catch (error) {
  console.error('❌ Could not create schema:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
