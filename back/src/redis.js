// One shared Redis connection for the whole server. Login sessions live here.
// Import it anywhere:  import { redis } from './redis.js'
import 'dotenv/config'
import { createClient } from 'redis'

// Local default works with `brew services start redis`. For a hosted Redis
// (Upstash, Redis Cloud, ...) set REDIS_URL, e.g. rediss://default:PASSWORD@HOST:PORT
export const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' })

redis.on('error', (err) => console.error('Redis error:', err.message))

try {
  await redis.connect()
} catch (err) {
  throw new Error(
    `Could not connect to Redis (${err.message}). Start it with: brew services start redis, or set REDIS_URL in .env.`
  )
}

// Key names. Each session is stored under sess:<sid>, and user_sessions:<userId>
// is a set of that user's session ids, so all of a user's logins can be ended
// at once (e.g. after a password change).
export const SESSION_PREFIX = 'sess:'
export const userSessionsKey = (userId) => `user_sessions:${userId}`
