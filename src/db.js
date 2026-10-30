// One shared Postgres connection pool for the whole server.
// Import it anywhere:  import { pool } from './db.js'
import 'dotenv/config'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL. Copy .env.example to .env and fill it in.')
}

// Return `date` columns as 'YYYY-MM-DD' strings instead of JS Date objects,
// which would otherwise shift by the server's time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

// Neon (and most hosted Postgres) requires SSL. The connection string from
// Neon includes ?sslmode=require, so SSL turns on automatically for it and
// stays off for a plain local database.
const useSsl = process.env.DATABASE_URL.includes('sslmode=require')

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
})