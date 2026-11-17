// Admin pages, linked from the profile menu. Logged-in users who aren't
// admins get a friendly "not authorized" page. Make someone an admin with
//   npm run user:role -- someone@example.com admin
//
//   /admin (also /admin/okrs)  dashboard: every OKR with its pass/fail
//   /admin/okrs/:number        one OKR's full breakdown
//
// The numbers come from the events table (src/events.js).
//
// Setting up an OKR: give its entry in OKRS a load() that returns
//   { description, target,
//     status: { tone: 'good' | 'bad' | 'muted', text },  // pass/fail badge
//     headline: { value, caption },                     // the dashboard's big number
//     stats: [{ label, value, note? }],
//     note?,                                            // e.g. "not enough data"
//     breakdown?: { title, columns: [...], rows: [[...], ...] },
//     footnote? }
// An OKR without load() shows on the dashboard as "Not tracked yet".
import { Router } from 'express'
import { readFile } from 'node:fs/promises'
import { pool } from '../db.js'

const router = Router()

// When OKR tracking went live. Only users created on or after this count as
// "new users", since earlier users' first attempts weren't logged.
// Set OKR_TRACKING_START in .env (see .env.example).
export const OKR_TRACKING_START = process.env.OKR_TRACKING_START || '2026-11-16T00:00:00-07:00'
if (Number.isNaN(Date.parse(OKR_TRACKING_START))) {
  throw new Error(`OKR_TRACKING_START "${OKR_TRACKING_START}" isn't a date. Use e.g. 2026-11-16T00:00:00-07:00`)
}

// Fewer eligible users than this and the pass rate is shown with a warning
const MIN_USERS = 10

const firstTrySql = await readFile(new URL('../../db/queries/okr3_first_try.sql', import.meta.url), 'utf8')

const ENTRY_POINT_LABELS = {
  home_card: 'Home card',
  recipe_details: 'Recipe window',
  calendar: 'Calendar + button',
  unknown: 'Unknown',
}

// 48.2 -> "48s", 75 -> "1m 15s"
function formatSeconds(seconds) {
  if (seconds == null) return '—'
  const total = Math.round(seconds)
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`
}

const formatRate = (rate) => (rate == null ? '—' : `${rate}%`)

// OKR 3: new users add a recipe to their calendar on the first try.
// Query: db/queries/okr3_first_try.sql
async function addToCalendarFirstTry() {
  const target = 80
  const { rows } = await pool.query(firstTrySql, [OKR_TRACKING_START])
  const total = rows.find((row) => row.is_total)
  const byEntryPoint = rows.filter((row) => !row.is_total)
  const enoughData = total.eligible >= MIN_USERS
  const onTarget = total.pass_rate != null && total.pass_rate >= target

  return {
    description: 'New users successfully add a recipe to their calendar on their first attempt, within 2 minutes, with no errors, cancellations or help.',
    target: `${target}% of new users`,
    status: !enoughData
      ? { tone: 'muted', text: 'Not enough data' }
      : onTarget
        ? { tone: 'good', text: 'Passing' }
        : { tone: 'bad', text: 'Failing' },
    headline: { value: formatRate(total.pass_rate), caption: `pass rate · target ${target}%` },
    stats: [
      { label: 'Pass rate', value: formatRate(total.pass_rate), note: `Target ${target}%` },
      { label: 'Passed', value: `${total.passes} / ${total.eligible}`, note: `${total.fails} failed` },
      { label: 'Median time', value: formatSeconds(total.median_seconds), note: 'For first tries that passed' },
    ],
    note: enoughData
      ? null
      : `Not enough data yet: ${total.eligible} of the ${MIN_USERS} eligible users needed for a reliable pass rate.`,
    breakdown: {
      title: 'By where the first attempt started',
      columns: ['Entry point', 'Users', 'Passed', 'Pass rate', 'Median time'],
      rows: byEntryPoint.map((row) => [
        ENTRY_POINT_LABELS[row.entry_point] ?? row.entry_point,
        row.eligible,
        row.passes,
        formatRate(row.pass_rate),
        formatSeconds(row.median_seconds),
      ]),
    },
    footnote: `Counts users who signed up on or after ${new Date(OKR_TRACKING_START).toLocaleDateString('en-US', { dateStyle: 'medium' })} and have tried adding a recipe. Attempts started in the last 2 minutes appear once they finish or time out.`,
  }
}

// All four OKRs, in the order the dashboard shows them. Teammates: replace
// a placeholder's title and add a load() when yours is tracked.
const OKRS = [
  { number: 1, title: 'Not set up yet' },
  { number: 2, title: 'Not set up yet' },
  { number: 3, title: 'Add to calendar on the first try', load: addToCalendarFirstTry },
  { number: 4, title: 'Not set up yet' },
]

const NOT_TRACKED = { status: { tone: 'muted', text: 'Not tracked yet' }, headline: { value: '—', caption: 'No data yet' } }

// { number, label: 'OKR 3', title, href, tracked, ...what load() returns }
async function loadOkr(okr) {
  const base = { ...okr, label: `OKR ${okr.number}`, href: `/admin/okrs/${okr.number}`, tracked: Boolean(okr.load) }
  return okr.load ? { ...base, ...(await okr.load()) } : { ...base, ...NOT_TRACKED }
}

router.use('/admin', (req, res, next) => {
  if (!req.user.is_admin) return res.status(403).render('admin-denied')
  next()
})

router.get(['/admin', '/admin/okrs'], async (req, res) => {
  const okrs = await Promise.all(OKRS.map(loadOkr))
  res.render('admin', { okrs })
})

router.get('/admin/okrs/:number', async (req, res) => {
  const okr = OKRS.find((o) => String(o.number) === req.params.number)
  // Unknown or not tracked yet: nothing to break down, so back to the dashboard
  if (!okr?.load) return res.redirect('/admin')
  res.render('admin-okr', { okr: await loadOkr(okr) })
})

export default router
