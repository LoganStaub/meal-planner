// Search page: /search?q=chicken&filter=dinner
//
// From the calendar's + buttons it also gets ?date=YYYY-MM-DD&slot=N. Then the
// page shows an "Adding to …" banner and each result gets an Add to calendar
// button (POST /api/me/calendar, see routes/calendar.js).
import { Router } from 'express'
import { pool } from '../db.js'
import { isDateKey } from '../validators.js'
import { MEAL_SLOTS } from './calendar.js'

const router = Router()

// Change the filter thresholds here.
const QUICK_MEAL_MAX_MINUTES = 30
const HIGH_PROTEIN_MIN_GRAMS = 25

// Meal-type filters match recipe_classes.recipe_class_desc.
const FILTERS = [
  { key: 'breakfast', label: 'Breakfast', mealClass: 'Breakfast' },
  { key: 'lunch', label: 'Lunch', mealClass: 'Lunch' },
  { key: 'dinner', label: 'Dinner', mealClass: 'Dinner' },
  { key: 'snack', label: 'Snack', mealClass: 'Snack' },
  { key: 'dessert', label: 'Dessert', mealClass: 'Dessert' },
  { key: 'quick', label: 'Quick Meals' },
  { key: 'high-protein', label: 'Healthy / High Protein' },
]

// recipes.macros is free text in two formats so far:
//   'Cal: 560, P: 30g, C: 41g, F: 31g'                  (live data)
//   'Per serving (serves 4): 520 kcal | Protein 34g | …'  (scripts/seedRecipes.js)
// This pulls out the protein grams, or null if it can't find them.
const PROTEIN_GRAMS_SQL = String.raw`
  (substring(r.macros from '(?:\mP|Protein)\s*:?\s*(\d+(?:\.\d+)?)\s*g'))::numeric`

// Turns ?slot= into 1-5. Accepts the calendar's numbers or a name like "dinner".
function parseSlot(value) {
  if (typeof value !== 'string') return null
  if (/^\d$/.test(value) && Object.hasOwn(MEAL_SLOTS, value)) return Number(value)
  const match = Object.entries(MEAL_SLOTS).find(([, name]) => name.toLowerCase() === value.toLowerCase())
  return match ? Number(match[0]) : null
}

// 40 -> '40 min', 370 -> '6 hr 10 min'
function formatPrepTime(minutes) {
  if (minutes == null) return null
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

// '2026-11-10' -> 'Tuesday, Nov 10'
function formatPlanDate(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// Builds a /search link, leaving out null/undefined params. An empty string is
// kept on purpose: filter= means "no filter", so the slot default isn't applied.
function searchHref(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) query.set(key, value)
  }
  const text = query.toString()
  return text ? `/search?${text}` : '/search'
}

// Every value from the user goes in `params` as $1, $2…; only fixed SQL
// fragments from this file are joined into the query text.
async function searchRecipes({ q, filter }) {
  const params = []
  const conditions = []

  if (q) {
    // Escape LIKE wildcards so "50%" searches for the text "50%"
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`)
    const n = params.length
    conditions.push(`(r.recipe_title ilike $${n} or exists (
      select 1
      from recipe_ingredients ri
      join ingredients i on i.ingredient_id = ri.ingredient_id
      where ri.recipe_id = r.recipe_id and i.ingredient_name ilike $${n}
    ))`)
  }

  if (filter?.mealClass) {
    params.push(filter.mealClass)
    conditions.push(`rc.recipe_class_desc = $${params.length}`)
  } else if (filter?.key === 'quick') {
    params.push(QUICK_MEAL_MAX_MINUTES)
    conditions.push(`r.prep_time <= $${params.length}`)
  } else if (filter?.key === 'high-protein') {
    params.push(HIGH_PROTEIN_MIN_GRAMS)
    conditions.push(`${PROTEIN_GRAMS_SQL} >= $${params.length}`)
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select r.recipe_id,
            r.recipe_title as title,
            r.prep_time,
            coalesce(rc.recipe_class_desc, 'Recipe') as tag,
            ${PROTEIN_GRAMS_SQL}::float as protein
     from recipes r
     left join recipe_classes rc on rc.recipe_class_id = r.recipe_class_id
     ${where}
     order by r.recipe_title`,
    params
  )

  return rows.map((row) => ({
    recipe_id: row.recipe_id,
    title: row.title,
    tag: row.tag,
    time: formatPrepTime(row.prep_time),
    protein: row.protein == null ? null : Math.round(row.protein),
  }))
}

// GET /search?q=&filter=&date=&slot=
router.get(['/search', '/search.html'], async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''

  // Planning mode only turns on for a real date; a bad slot just means "pick one"
  const date = isDateKey(req.query.date) ? req.query.date : null
  const slot = date ? parseSlot(req.query.slot) : null

  // Coming from "Add breakfast" etc. (no filter param at all) starts on that
  // meal's filter. Once the user clears it, links carry filter= so it stays off.
  let filter = FILTERS.find((f) => f.key === req.query.filter) ?? null
  if (req.query.filter === undefined && slot) {
    filter = FILTERS.find((f) => f.mealClass === MEAL_SLOTS[slot]) ?? null
  }
  const noFilter = date ? '' : null
  const filterCleared = date && req.query.filter === ''
  const keep = { q: q || null, filter: filter?.key ?? (filterCleared ? '' : null), date, slot }

  const plan = date && {
    date,
    slot,
    dayLabel: formatPlanDate(date),
    slotLabel: slot ? MEAL_SLOTS[slot] : null,
    calendarHref: `/calendar?date=${date}`,
    // The banner's X: same search and filter, but no longer adding to a day
    dismissHref: searchHref({ q: keep.q, filter: filter?.key ?? null }),
    slotChoices: Object.entries(MEAL_SLOTS).map(([number, label]) => ({
      label,
      // Switching meals swaps a meal-type filter for the new meal's default,
      // but keeps Quick Meals / High Protein or a cleared filter
      href: searchHref({ ...keep, slot: number, filter: filter?.mealClass ? null : keep.filter }),
      active: Number(number) === slot,
    })),
  }

  const recipes = await searchRecipes({ q, filter })

  res.render('search', {
    q,
    recipes,
    plan,
    filters: FILTERS.map((f) => ({
      key: f.key,
      label: f.label,
      active: f === filter,
      // Clicking the active filter again clears it
      href: searchHref({ ...keep, filter: f === filter ? noFilter : f.key }),
    })),
    activeFilter: filter,
    filterCleared,
    clearSearchHref: searchHref({ ...keep, q: null }),
    showAllHref: searchHref({ date, slot, filter: noFilter }),
    active: 'search',
  })
})

export default router
