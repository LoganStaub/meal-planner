// Daily limits for "Add a recipe with AI" (see routes/recipeAssistant.js).
//
//   * Saved recipes: 3 per user per day, counted from recipes.created_by and
//     recipes.created_at (db/migrations/007_recipe_created_by.sql).
//   * AI checks: 5 per user per day, counted in Redis, because a check that
//     is rejected or never saved leaves nothing in the database. Each check
//     costs money, so the cap protects the Anthropic bill.
//
// A "day" runs midnight to midnight in APP_TIME_ZONE (see .env.example).
// Render's servers run on UTC, so without it the limit would reset in the
// late afternoon or evening in US time zones.
import { redis } from './redis.js'

export const MAX_RECIPES_PER_DAY = 3
export const MAX_CHECKS_PER_DAY = 5

export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Denver'

// Today's date in APP_TIME_ZONE, e.g. '2026-11-10'
function today() {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(new Date())
}

// Check counts are kept for two days, then Redis deletes them by itself
const checksKey = (userId) => `recipe_checks:${today()}:${userId}`
const CHECKS_TTL_SECONDS = 2 * 24 * 60 * 60

// How many recipes this user added since midnight in APP_TIME_ZONE.
// `db` is the pool or a client inside a transaction.
export async function countAddedToday(db, userId) {
  const { rows } = await db.query(
    `select count(*)::int as added
     from recipes
     where created_by = $1
       and created_at >= (date_trunc('day', now() at time zone $2) at time zone $2)`,
    [userId, APP_TIME_ZONE]
  )
  return rows[0].added
}

async function countChecksToday(userId) {
  return Number(await redis.get(checksKey(userId))) || 0
}

// { added, checks, remaining, checksRemaining } for today
export async function getUsage(db, userId) {
  const [added, checks] = await Promise.all([countAddedToday(db, userId), countChecksToday(userId)])
  return {
    added,
    checks,
    remaining: Math.max(0, MAX_RECIPES_PER_DAY - added),
    checksRemaining: Math.max(0, MAX_CHECKS_PER_DAY - checks),
  }
}

// Uses up one of today's checks. Returns false, without using one, if none
// are left. INCR is atomic, so two checks at the same moment can't both
// squeeze past the cap.
export async function claimCheck(userId) {
  const key = checksKey(userId)
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, CHECKS_TTL_SECONDS)
  if (count > MAX_CHECKS_PER_DAY) {
    await redis.decr(key)
    return false
  }
  return true
}

// Gives a check back when the assistant couldn't be reached at all
export async function refundCheck(userId) {
  const count = await redis.decr(checksKey(userId))
  if (count < 0) await redis.set(checksKey(userId), '0', { expiration: { type: 'EX', value: CHECKS_TTL_SECONDS } })
}

// Call inside a transaction, before inserting the recipe. Waits for any other
// save by the same user to finish (the lock is released at commit/rollback),
// then reports whether they still have a recipe left today. This stops two
// saves at the same moment from both slipping under the limit.
export async function lockAndCheckDailyLimit(db, userId) {
  await db.query("select pg_advisory_xact_lock(hashtext('recipe_add_limit'), $1)", [userId])
  return (await countAddedToday(db, userId)) < MAX_RECIPES_PER_DAY
}
