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
//     followUp?: { title, description?, stats: [...] },  // extra measure, not pass/fail
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

const readQuery = (name) => readFile(new URL(`../../db/queries/${name}`, import.meta.url), 'utf8')
const discoverSaveSql = await readQuery('okr1_discover_save.sql')
const followThroughSql = await readQuery('okr1_follow_through.sql')
const mealFitSql = await readQuery('okr2_meal_fit.sql')
const firstTrySql = await readQuery('okr3_first_try.sql')
const threeDayPlanSql = await readQuery('okr4_three_day_plan.sql')

const ENTRY_POINT_LABELS = {
  home_card: 'Home card',
  recipe_details: 'Recipe page',
  calendar: 'Calendar + button',
  unknown: 'Unknown',
}

// 48.2 -> "48s", 75 -> "1m 15s"
function formatSeconds(seconds) {
  if (seconds == null) return '—'
  const total = Math.round(seconds)
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`
}

// 90 -> "1m 30s", 7200 -> "2h", 259200 -> "3.0 days"
function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds < 3600) return formatSeconds(seconds)
  if (seconds < 48 * 3600) return `${Math.round(seconds / 3600)}h`
  return `${(seconds / 86400).toFixed(1)} days`
}

const formatRate = (rate) => (rate == null ? '—' : `${rate}%`)

// The pass/fail badge for an OKR measured as "target % of eligible users"
function passFailStatus({ eligible, pass_rate: passRate }, target) {
  if (eligible < MIN_USERS) return { tone: 'muted', text: 'Not enough data' }
  return passRate != null && passRate >= target
    ? { tone: 'good', text: 'Passing' }
    : { tone: 'bad', text: 'Failing' }
}

function notEnoughDataNote(eligible) {
  return eligible >= MIN_USERS
    ? null
    : `Not enough data yet: ${eligible} of the ${MIN_USERS} eligible users needed for a reliable pass rate.`
}

// 2 of 7 -> "28.6%"
const share = (count, total) => (total ? `${Math.round((1000 * count) / total) / 10}%` : '—')

const trackingStartLabel = new Date(OKR_TRACKING_START).toLocaleDateString('en-US', { dateStyle: 'medium' })

// OKR 1: new users save a recipe they say they'd make, within 3 minutes of
// first opening the Home swipe feed. Query: db/queries/okr1_discover_save.sql
async function discoverSave() {
  const target = 80
  const [{ rows: [total] }, { rows: [follow] }] = await Promise.all([
    pool.query(discoverSaveSql, [OKR_TRACKING_START]),
    pool.query(followThroughSql, [OKR_TRACKING_START]),
  ])

  return {
    description: "New users find and save a recipe they say they'd want to try, within 3 minutes of first opening the Discover (Home) feed.",
    target: `${target}% (8 of 10) within 3 minutes`,
    status: passFailStatus(total, target),
    headline: { value: formatRate(total.pass_rate), caption: `pass rate · target ${target}%` },
    stats: [
      { label: 'Pass rate', value: formatRate(total.pass_rate), note: `Target ${target}%` },
      { label: 'Passed', value: `${total.passes} / ${total.eligible}`, note: `${total.fails} failed` },
      { label: 'In progress', value: String(total.in_progress), note: 'Opened the feed under 3 minutes ago; not in the pass rate' },
      { label: 'Median time to save', value: formatSeconds(total.median_seconds), note: 'For users who passed' },
    ],
    note: notEnoughDataNote(total.eligible),
    breakdown: {
      title: 'Outcomes',
      columns: ['Outcome', 'Users', 'Share of eligible'],
      rows: [
        ["Passed (saved in time, would make it)", total.passes, share(total.passes, total.eligible)],
        ["Saved in time, but wouldn't make it", total.said_no, share(total.said_no, total.eligible)],
        ['Saved in time, never answered', total.no_answer, share(total.no_answer, total.eligible)],
        ['Too slow (saved after 3 minutes)', total.too_slow, share(total.too_slow, total.eligible)],
        ['Never saved from the feed', total.never_saved, share(total.never_saved, total.eligible)],
      ],
    },
    // Query: db/queries/okr1_follow_through.sql
    followUp: {
      title: 'Follow-through',
      description: "Saying yes is only what users say. Of the recipes they said they'd make, how many did they add to their meal plan within 7 days? Not part of the pass rate.",
      stats: [
        {
          label: 'Follow-through rate',
          value: formatRate(follow.follow_through_rate),
          note: follow.window_closed
            ? `${follow.planned_closed} of ${follow.window_closed} yeses from 7+ days ago`
            : 'Shows once a yes is 7 days old',
        },
        { label: 'Planned so far', value: `${follow.planned} / ${follow.said_yes}`, note: "Of every recipe users said they'd make" },
        { label: 'Waiting', value: String(follow.waiting), note: 'Said yes under 7 days ago, not planned yet' },
        { label: 'Median time to plan', value: formatDuration(follow.median_seconds), note: 'From saying yes to adding it to the meal plan' },
      ],
    },
    footnote: `Counts users who signed up on or after ${trackingStartLabel} and have opened the Home feed, timed from their first visit. "Would make it" is their answer to the prompt shown after saving. Only saves from the Home feed count, and unliking later doesn't undo a pass.`,
  }
}

// OKR 2: users rate "I found meals I'd actually make" 4+ out of 5 on average.
// Asked on Home after the 5th meal, at most once a week per user
// (src/routes/mealFit.js). Query: db/queries/okr2_meal_fit.sql
async function mealFitRating() {
  const target = 4
  const { rows } = await pool.query(mealFitSql)
  const total = rows.find((row) => row.is_total)
  const weeks = rows.filter((row) => !row.is_total).slice(0, 8)
  const average = total.average == null ? '—' : `${total.average.toFixed(2)} / 5`

  let status
  if (total.ratings < MIN_USERS) status = { tone: 'muted', text: 'Not enough data' }
  else if (total.average >= target) status = { tone: 'good', text: 'Passing' }
  else status = { tone: 'bad', text: 'Failing' }

  const weekLabel = (week) =>
    new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return {
    description: "Users rate “I found meals I'd actually make” at 4 or higher out of 5 on average. Asked after swiping through all 5 meals on Home, at most once a week per user.",
    target: `average of ${target} or higher out of 5`,
    status,
    headline: { value: average, caption: `average rating · target ${target}+` },
    stats: [
      { label: 'Average rating', value: average, note: `Target ${target} or higher` },
      { label: 'Ratings', value: String(total.ratings), note: `From ${total.raters} user${total.raters === 1 ? '' : 's'}` },
      { label: 'Rated 4 or 5', value: share(total.four_plus, total.ratings), note: `${total.four_plus} of ${total.ratings} ratings` },
      {
        label: 'Response rate',
        value: share(total.ratings, total.prompts),
        note: `${total.prompts} prompts shown · ${total.dismissed} closed without rating`,
      },
    ],
    note: total.ratings >= MIN_USERS
      ? null
      : `Not enough data yet: ${total.ratings} of the ${MIN_USERS} ratings needed for a reliable average.`,
    breakdown: {
      title: 'By week (most recent 8)',
      columns: ['Week of', 'Ratings', 'Average', 'Rated 4 or 5', 'Prompts shown'],
      rows: weeks.map((row) => [
        weekLabel(row.week),
        row.ratings,
        row.average == null ? '—' : row.average.toFixed(2),
        share(row.four_plus, row.ratings),
        row.prompts,
      ]),
    },
    followUp: {
      title: 'Rating spread',
      description: 'How many ratings gave each number of stars, all time.',
      stats: [5, 4, 3, 2, 1].map((stars) => ({
        label: `${stars} star${stars === 1 ? '' : 's'}`,
        value: String(total[`stars_${stars}`]),
        note: share(total[`stars_${stars}`], total.ratings),
      })),
    },
    footnote: 'Counts every user, not only new ones. Each rating counts once, and a user can rate at most once every 7 days, so frequent users can\'t swamp the average. Closing the popup still uses up that week\'s prompt.',
  }
}

// OKR 3: new users add a recipe to their calendar on the first try.
// Query: db/queries/okr3_first_try.sql
async function addToCalendarFirstTry() {
  const target = 80
  const { rows } = await pool.query(firstTrySql, [OKR_TRACKING_START])
  const total = rows.find((row) => row.is_total)
  const byEntryPoint = rows.filter((row) => !row.is_total)

  return {
    description: 'New users successfully add a recipe to their calendar on their first attempt, within 2 minutes, with no errors, cancellations or help.',
    target: `${target}% of new users`,
    status: passFailStatus(total, target),
    headline: { value: formatRate(total.pass_rate), caption: `pass rate · target ${target}%` },
    stats: [
      { label: 'Pass rate', value: formatRate(total.pass_rate), note: `Target ${target}%` },
      { label: 'Passed', value: `${total.passes} / ${total.eligible}`, note: `${total.fails} failed` },
      { label: 'Median time', value: formatSeconds(total.median_seconds), note: 'For first tries that passed' },
    ],
    note: notEnoughDataNote(total.eligible),
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
    footnote: `Counts users who signed up on or after ${trackingStartLabel} and have tried adding a recipe. Attempts started in the last 2 minutes appear once they finish or time out.`,
  }
}

// OKR 4: new users plan meals on 3 different days within 5 minutes of
// starting to plan. Query: db/queries/okr4_three_day_plan.sql
async function threeDayPlan() {
  const target = 80
  const { rows: [total] } = await pool.query(threeDayPlanSql, [OKR_TRACKING_START])

  return {
    description: 'New users schedule at least one meal on 3 different days within 5 minutes of starting to plan.',
    target: `${target}% within 5 minutes`,
    status: passFailStatus(total, target),
    headline: { value: formatRate(total.pass_rate), caption: `pass rate · target ${target}%` },
    stats: [
      { label: 'Pass rate', value: formatRate(total.pass_rate), note: `Target ${target}%` },
      { label: 'Passed', value: `${total.passes} / ${total.eligible}`, note: `${total.fails} failed` },
      { label: 'In progress', value: String(total.in_progress), note: 'Started under 5 minutes ago; not in the pass rate' },
      { label: 'Median time to 3 days', value: formatSeconds(total.median_seconds), note: 'Everyone who reached 3 days, including the too slow' },
    ],
    note: notEnoughDataNote(total.eligible),
    breakdown: {
      title: 'Outcomes',
      columns: ['Outcome', 'Users', 'Share of eligible'],
      rows: [
        ['Passed (3 days within 5 minutes)', total.passes, share(total.passes, total.eligible)],
        ['Too slow (3 days, but after 5 minutes)', total.too_slow, share(total.too_slow, total.eligible)],
        ['Never reached 3 days', total.never_reached, share(total.never_reached, total.eligible)],
      ],
    },
    footnote: `Counts users who signed up on or after ${trackingStartLabel} and have started adding a recipe, timed from their first start. Days come from completed adds, so removing a meal later doesn't undo progress, and several meals on one day count as one day.`,
  }
}

// All four OKRs, in the order the dashboard shows them. Teammates: replace
// a placeholder's title and add a load() when yours is tracked.
const OKRS = [
  { number: 1, title: "Save a recipe you'd try within 3 minutes", load: discoverSave },
  { number: 2, title: "Found meals I'd actually make (4+ of 5)", load: mealFitRating },
  { number: 3, title: 'Add to calendar on the first try', load: addToCalendarFirstTry },
  { number: 4, title: 'Plan 3 days within 5 minutes', load: threeDayPlan },
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
