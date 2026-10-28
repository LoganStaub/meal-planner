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

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
