// Daily limits for "Add your own recipe" (see routes/recipeAssistant.js).
//
// The recipes table has no "added by" or "added at" columns, so the database
// can't tell us how many recipes a user added today. Until it can, the counts
// live in a small JSON file (back/data/recipe-add-log.json, git-ignored):
//   { "2026-11-10": { "1": { "added": 2, "checks": 5 } } }
// Only today's entry is kept. To move this into the database later, replace
// the functions below; nothing else needs to change.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// A user can save this many of their own recipes per day.
export const MAX_RECIPES_PER_DAY = 3
// Each AI check costs money, so checks are capped too (rejected or abandoned
// recipes still count as a check).
export const MAX_CHECKS_PER_DAY = 10

const logPath = fileURLToPath(new URL('../data/recipe-add-log.json', import.meta.url))

// The server's local day, e.g. '2026-11-10'. Limits reset at local midnight.
function today() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function readToday() {
  try {
    const log = JSON.parse(fs.readFileSync(logPath, 'utf8'))
    const entry = log[today()]
    return entry && typeof entry === 'object' ? entry : {}
  } catch {
    // No file yet, or it's unreadable: start the day fresh
    return {}
  }
}

function writeToday(users) {
  fs.mkdirSync(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true })
  fs.writeFileSync(logPath, JSON.stringify({ [today()]: users }, null, 2))
}

function change(userId, field, amount) {
  const users = readToday()
  const counts = { added: 0, checks: 0, ...users[userId] }
  counts[field] = Math.max(0, counts[field] + amount)
  users[userId] = counts
  writeToday(users)
}

// { added, checks, remaining, checksRemaining } for today
export function getUsage(userId) {
  const counts = { added: 0, checks: 0, ...readToday()[userId] }
  return {
    added: counts.added,
    checks: counts.checks,
    remaining: Math.max(0, MAX_RECIPES_PER_DAY - counts.added),
    checksRemaining: Math.max(0, MAX_CHECKS_PER_DAY - counts.checks),
  }
}

export function recordCheck(userId) {
  change(userId, 'checks', 1)
}

// Gives a check back when the assistant couldn't be reached at all
export function refundCheck(userId) {
  change(userId, 'checks', -1)
}

// Takes one of today's recipe slots. Returns false if none are left.
// Call this BEFORE saving and give the slot back with releaseSlot() if the
// save fails, so two saves at the same moment can't both slip under the limit.
export function reserveSlot(userId) {
  if (getUsage(userId).remaining === 0) return false
  change(userId, 'added', 1)
  return true
}

export function releaseSlot(userId) {
  change(userId, 'added', -1)
}
