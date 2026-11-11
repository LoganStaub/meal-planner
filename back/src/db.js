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

// Neon (and most hosted Postgres) requires SSL, and its connection strings
// end in ?sslmode=require. Any sslmode other than "disable" turns SSL on, with
// the server's certificate checked so the connection can't be intercepted.
// A plain local database (no sslmode) connects without SSL.
// sslmode is removed from the URL because pg would otherwise print a warning
// about how it will treat "require" in a future version.
const url = new URL(process.env.DATABASE_URL)
const sslmode = url.searchParams.get('sslmode')
url.searchParams.delete('sslmode')

export const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: Boolean(sslmode) && sslmode !== 'disable',
})