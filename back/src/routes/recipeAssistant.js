// "Add your own recipe" on the Search page: /api/recipe-assistant
//
//   GET  …/status              how many recipes the user can still add today
//   POST …/check   { text }    the AI checks the recipe and fits it to our tables.
//                              Returns a draft to preview; nothing is saved yet.
//   POST …/drafts/:id/save     saves a checked draft to the database
//
// The browser only ever sends back a draft id, never the recipe itself, so
// what gets saved is exactly what the AI checked (see src/recipeAssistant.js).
// Daily limits are in src/recipeAddLimit.js.
//
// Every route needs a logged-in user. Their id comes from the login session
// (src/currentUser.js), not from the URL, so the daily limit can't be dodged
// by sending someone else's id.
import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { requireUser } from '../currentUser.js'
import {
  checkRecipe, AssistantUnavailableError, MIN_RECIPE_TEXT, MAX_RECIPE_TEXT,
} from '../recipeAssistant.js'
import {
  getUsage, recordCheck, refundCheck, reserveSlot, releaseSlot, MAX_RECIPES_PER_DAY, MAX_CHECKS_PER_DAY,
} from '../recipeAddLimit.js'

const router = Router()
router.use('/recipe-assistant', requireUser)

// Checked recipes waiting for the user to press Save. Kept in memory: they
// are short-lived, and a server restart just means checking again.
const DRAFT_MINUTES = 30
const MAX_DRAFTS_PER_USER = 5
const drafts = new Map() // draftId -> { userId, recipe, expires }

function dropExpiredDrafts() {
  const now = Date.now()
  for (const [id, draft] of drafts) {
    if (draft.expires < now) drafts.delete(id)
  }
}

function saveDraft(userId, recipe) {
  dropExpiredDrafts()
  // Oldest first, so a user who keeps re-checking doesn't pile drafts up
  const mine = [...drafts].filter(([, draft]) => draft.userId === userId)
  for (const [id] of mine.slice(0, Math.max(0, mine.length - MAX_DRAFTS_PER_USER + 1))) {
    drafts.delete(id)
  }
  const id = randomUUID()
  drafts.set(id, { userId, recipe, expires: Date.now() + DRAFT_MINUTES * 60_000 })
  return id
}

function limitBody(userId) {
  const usage = getUsage(userId)
  return { limit: MAX_RECIPES_PER_DAY, added: usage.added, remaining: usage.remaining }
}

const WALL_MESSAGE =
  `You've added ${MAX_RECIPES_PER_DAY} recipes today, which is the daily limit. You can add more tomorrow.`

async function recipeTitleExists(db, title) {
  const { rows } = await db.query(
    'select 1 from recipes where lower(recipe_title) = lower($1) limit 1', [title])
  return rows.length > 0
}

// The AI must pick from the names in our lookup tables
async function loadLookups() {
  const [classes, measurements] = await Promise.all([
    pool.query('select recipe_class_id, recipe_class_desc from recipe_classes order by recipe_class_id'),
    pool.query('select measure_amount_id, measurement_desc from measurements order by measure_amount_id'),
  ])
  return {
    classIds: Object.fromEntries(classes.rows.map((r) => [r.recipe_class_desc, r.recipe_class_id])),
    measureIds: Object.fromEntries(measurements.rows.map((r) => [r.measurement_desc, r.measure_amount_id])),
  }
}

// GET /api/recipe-assistant/status
router.get('/recipe-assistant/status', (req, res) => {
  const { userId } = req
  res.json({
    ...limitBody(userId),
    min_length: MIN_RECIPE_TEXT,
    max_length: MAX_RECIPE_TEXT,
  })
})

// POST /api/recipe-assistant/check  { text }
router.post('/recipe-assistant/check', async (req, res) => {
  const { userId } = req

  // The wall: no point checking a recipe that can't be saved today
  const usage = getUsage(userId)
  if (usage.remaining === 0) {
    return res.status(429).json({ error: WALL_MESSAGE, code: 'daily_limit', ...limitBody(userId) })
  }
  if (usage.checksRemaining === 0) {
    return res.status(429).json({
      error: `You've used all ${MAX_CHECKS_PER_DAY} recipe checks for today. Please try again tomorrow.`,
      code: 'check_limit',
      ...limitBody(userId),
    })
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (text.length < MIN_RECIPE_TEXT) {
    return res.status(400).json({
      error: 'Please write out the recipe: its name, the ingredients and the steps.',
    })
  }
  if (text.length > MAX_RECIPE_TEXT) {
    return res.status(400).json({
      error: `That recipe is too long. Please keep it under ${MAX_RECIPE_TEXT} characters.`,
    })
  }

  const { classIds, measureIds } = await loadLookups()

  // Counted before the call so a slow or failed check can't be retried for free
  recordCheck(userId)

  let result
  try {
    result = await checkRecipe(text, {
      classNames: Object.keys(classIds),
      measurementNames: Object.keys(measureIds),
    })
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      refundCheck(userId)
      return res.status(503).json({ error: error.message, code: 'assistant_unavailable' })
    }
    throw error
  }

  if (!result.accepted) {
    return res.status(422).json({ error: result.reason, code: 'rejected', ...limitBody(userId) })
  }
  if (await recipeTitleExists(pool, result.recipe.title)) {
    return res.status(409).json({
      error: `There is already a recipe called "${result.recipe.title}". Search for it instead, or give yours a different name.`,
      code: 'duplicate',
      ...limitBody(userId),
    })
  }

  const draftId = saveDraft(userId, result.recipe)
  res.json({ draft_id: draftId, recipe: result.recipe, ...limitBody(userId) })
})

// POST /api/recipe-assistant/drafts/:draftId/save
router.post('/recipe-assistant/drafts/:draftId/save', async (req, res) => {
  const { userId } = req
  const { draftId } = req.params

  dropExpiredDrafts()
  const draft = drafts.get(draftId)
  if (!draft || draft.userId !== userId) {
    return res.status(404).json({
      error: 'That recipe check has expired. Please check the recipe again.',
      code: 'draft_expired',
    })
  }

  if (!reserveSlot(userId)) {
    return res.status(429).json({ error: WALL_MESSAGE, code: 'daily_limit', ...limitBody(userId) })
  }
  // Removed now so a double-click can't save the same draft twice
  drafts.delete(draftId)

  const { recipe } = draft
  const db = await pool.connect()
  try {
    await db.query('begin')

    if (await recipeTitleExists(db, recipe.title)) {
      await db.query('rollback')
      releaseSlot(userId)
      return res.status(409).json({
        error: `There is already a recipe called "${recipe.title}".`,
        code: 'duplicate',
        ...limitBody(userId),
      })
    }

    const { classIds, measureIds } = await loadLookups()
    const inserted = await db.query(
      `insert into recipes (recipe_title, recipe_class_id, cost, macros, prep_time, instructions)
       values ($1, $2, $3, $4, $5, $6) returning recipe_id`,
      [recipe.title, classIds[recipe.meal_class] ?? null, recipe.cost, recipe.macros, recipe.prep_time,
        recipe.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')]
    )
    const recipeId = inserted.rows[0].recipe_id

    for (const [index, ingredient] of recipe.ingredients.entries()) {
      const measureId = measureIds[ingredient.measurement] ?? null

      // Reuse an ingredient with the same name (ignoring case), as
      // scripts/seedRecipes.js does. A new one starts as "none" in the pantry
      // (pantry_amount_id 2), so it shows up as something to buy.
      const existing = await db.query(
        'select ingredient_id from ingredients where lower(ingredient_name) = lower($1) limit 1',
        [ingredient.name]
      )
      const ingredientId = existing.rows[0]?.ingredient_id ?? (await db.query(
        `insert into ingredients (ingredient_name, pantry_amount_id, measure_amount_id)
         values ($1, 2, $2) returning ingredient_id`,
        [ingredient.name, measureId]
      )).rows[0].ingredient_id

      await db.query(
        `insert into recipe_ingredients (recipe_id, recipe_seq_number, ingredient_id, measure_amount_id, amount)
         values ($1, $2, $3, $4, $5)`,
        [recipeId, index + 1, ingredientId, measureId, ingredient.amount]
      )
    }

    await db.query('commit')
    res.status(201).json({ recipe_id: recipeId, recipe_title: recipe.title, ...limitBody(userId) })
  } catch (error) {
    await db.query('rollback').catch(() => {})
    releaseSlot(userId)
    // Keep the draft so the user can press Save again
    drafts.set(draftId, draft)
    throw error
  } finally {
    db.release()
  }
})

export default router
