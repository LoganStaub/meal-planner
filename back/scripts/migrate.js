// Run with:  npm run db:migrate
// Applies each db/migrations/*.sql file that hasn't run yet, in filename order.
// Unlike db:init, this never drops tables, so existing data is kept.
import { readdir, readFile } from 'node:fs/promises'
import { pool } from '../src/db.js'

const migrationsDir = new URL('../db/migrations/', import.meta.url)

const client = await pool.connect()
try {
  await client.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )`)

  const { rows } = await client.query('select filename from schema_migrations')
  const applied = new Set(rows.map((row) => row.filename))
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
  const pending = files.filter((name) => !applied.has(name))

  if (pending.length === 0) {
    console.log('✅ Database is up to date.')
  }

  for (const filename of pending) {
    const sql = await readFile(new URL(filename, migrationsDir), 'utf8')
    // Each migration runs in a transaction: it applies fully or not at all.
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into schema_migrations (filename) values ($1)', [filename])
      await client.query('commit')
      console.log(`✅ Applied ${filename}`)
    } catch (error) {
      await client.query('rollback')
      throw new Error(`${filename} failed: ${error.message}`)
    }
  }
} catch (error) {
  console.error('❌ Migration failed:', error.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
