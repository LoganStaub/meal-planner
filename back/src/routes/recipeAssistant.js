// "Add a recipe with AI" on the Recipes page: /api/recipe-assistant
//
//   GET  …/status              how many recipes the user can still add today
//   POST …/check   { text }    the AI checks the recipe and fits it to our tables.
//                              Returns a draft to preview; nothing is saved yet.
//   POST …/drafts/:id/save  { recipe? }
//                              saves a checked draft to the database, with any
//                              corrections the user made in the preview
//
// The draft stays on the server. The browser sends back its id plus the few
// fields a user may correct (name, meal type, time, cost, ingredients), and
// those are re-checked in code. The steps are never sent back, so they are
// saved exactly as the AI checked them (see src/recipeAssistant.js).
// Daily limits are in src/recipeAddLimit.js.
//
// Every route needs a logged-in user (requireLogin in server.js). Their id
// comes from the login session (req.user), not from the URL, so the daily
// limit can't be dodged by sending someone else's id.
//
// Recipes added here go into the shared list that every user searches, and
// recipes.created_by records who added them (db/migrations/007).
import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { pool } from '../db.js'
import { redis } from '../redis.js'
import {
  checkRecipe, applyRecipeEdits, AssistantUnavailableError, MIN_RECIPE_TEXT, MAX_RECIPE_TEXT,
} from '../recipeAssistant.js'
import {
  getUsage, claimCheck, refundCheck, lockAndCheckDailyLimit, MAX_RECIPES_PER_DAY, MAX_CHECKS_PER_DAY,
} from '../recipeAddLimit.js'

const router = Router()

router.use('/recipe-assistant', (req, res, next) => {
  req.userId = req.user.user_id
  next()
})

// Checked recipes waiting for the user to press Save. Kept in Redis so they
// survive a server restart, and Redis deletes them by itself after 30 minutes.
const DRAFT_TTL_SECONDS = 30 * 60
const draftKey = (draftId) => `recipe_draft:${draftId}`

async function storeDraft(draftId, draft) {
  await redis.set(draftKey(draftId), JSON.stringify(draft), {
    expiration: { type: 'EX', value: DRAFT_TTL_SECONDS },
  })
}

// Takes the draft out of Redis in one step (GETDEL), so a double-click on
// Save can't save the same draft twice. Returns null if it's gone.
async function takeDraft(draftId) {
  const stored = await redis.getDel(draftKey(draftId))
  return stored ? JSON.parse(stored) : null
}

async function limitBody(userId) {
  const usage = await getUsage(pool, userId)
  return {
    limit: MAX_RECIPES_PER_DAY,
    added: usage.added,
    remaining: usage.remaining,
    checks_remaining: usage.checksRemaining,
  }
}

const WALL_MESSAGE =
  `You've added ${MAX_RECIPES_PER_DAY} recipes today, which is the daily limit. You can add more tomorrow.`
const CHECK_WALL_MESSAGE =
  `You've used all ${MAX_CHECKS_PER_DAY} recipe checks for today. Please try again tomorrow.`

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

// Every ingredient we already have. The AI reuses these names, and the
// preview suggests them, so "Parmesan cheese" isn't added next to "Parmesan".
// The cap only keeps the AI prompt a sensible size if the list grows huge.
const MAX_INGREDIENT_NAMES = 2000
async function loadIngredientNames() {
  const { rows } = await pool.query(
    'select ingredient_name from ingredients order by lower(ingredient_name), ingredient_id limit $1',
    [MAX_INGREDIENT_NAMES]
  )
  return rows.map((row) => row.ingredient_name)
}

// GET /api/recipe-assistant/status
router.get('/recipe-assistant/status', async (req, res) => {
  res.json({
    ...(await limitBody(req.userId)),
    min_length: MIN_RECIPE_TEXT,
    max_length: MAX_RECIPE_TEXT,
  })
})

// POST /api/recipe-assistant/check  { text }
router.post('/recipe-assistant/check', async (req, res) => {
  const { userId } = req

  // The wall: no point checking a recipe that can't be saved today
  const usage = await getUsage(pool, userId)
  if (usage.remaining === 0) {
    return res.status(429).json({ error: WALL_MESSAGE, code: 'daily_limit', ...(await limitBody(userId)) })
  }
  if (usage.checksRemaining === 0) {
    return res.status(429).json({ error: CHECK_WALL_MESSAGE, code: 'check_limit', ...(await limitBody(userId)) })
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

  const [{ classIds, measureIds }, ingredientNames] = await Promise.all([loadLookups(), loadIngredientNames()])

  // Counted before the call so a slow or failed check can't be retried for free
  if (!(await claimCheck(userId))) {
    return res.status(429).json({ error: CHECK_WALL_MESSAGE, code: 'check_limit', ...(await limitBody(userId)) })
  }

  let result
  try {
    result = await checkRecipe(text, {
      classNames: Object.keys(classIds),
      measurementNames: Object.keys(measureIds),
      ingredientNames,
    })
  } catch (error) {
    if (error instanceof AssistantUnavailableError) {
      await refundCheck(userId)
      return res.status(503).json({ error: error.message, code: 'assistant_unavailable' })
    }
    throw error
  }

  if (!result.accepted) {
    return res.status(422).json({ error: result.reason, code: 'rejected', ...(await limitBody(userId)) })
  }
  if (await recipeTitleExists(pool, result.recipe.title)) {
    return res.status(409).json({
      error: `There is already a recipe called "${result.recipe.title}". Find it on the Recipes page instead, or give yours a different name.`,
      code: 'duplicate',
      ...(await limitBody(userId)),
    })
  }

  const draftId = randomUUID()
  await storeDraft(draftId, { userId, recipe: result.recipe })
  res.json({
    draft_id: draftId,
    recipe: result.recipe,
    // For the preview's dropdowns and ingredient suggestions
    meal_classes: Object.keys(classIds),
    measurements: Object.keys(measureIds),
    ingredient_names: ingredientNames,
    ...(await limitBody(userId)),
  })
})

// POST /api/recipe-assistant/drafts/:draftId/save  { recipe? }
// recipe = { title, meal_class, prep_time, cost, ingredients } as corrected in
// the preview. Leave it out to save the draft exactly as it was checked.
router.post('/recipe-assistant/drafts/:draftId/save', async (req, res) => {
  const { userId } = req
  const { draftId } = req.params

  const draft = await takeDraft(draftId)
  if (!draft || draft.userId !== userId) {
    // Someone else's draft goes back untouched
    if (draft) await storeDraft(draftId, draft)
    return res.status(404).json({
      error: 'That recipe check has expired. Please check the recipe again.',
      code: 'draft_expired',
    })
  }

  const { classIds, measureIds } = await loadLookups()

  let { recipe } = draft
  if (req.body?.recipe !== undefined) {
    const edited = applyRecipeEdits(recipe, req.body.recipe, Object.keys(classIds), Object.keys(measureIds))
    if (edited.error) {
      // Keep the draft so they can fix the field and press Save again
      await storeDraft(draftId, draft)
      return res.status(400).json({ error: edited.error, code: 'invalid_edit' })
    }
    recipe = edited.recipe
  }

  const db = await pool.connect()
  let saved = false
  try {
    await db.query('begin')

    if (!(await lockAndCheckDailyLimit(db, userId))) {
      await db.query('rollback')
      return res.status(429).json({ error: WALL_MESSAGE, code: 'daily_limit', ...(await limitBody(userId)) })
    }

    if (await recipeTitleExists(db, recipe.title)) {
      await db.query('rollback')
      return res.status(409).json({
        error: `There is already a recipe called "${recipe.title}". Change the name and save again.`,
        code: 'duplicate',
        ...(await limitBody(userId)),
      })
    }

    const inserted = await db.query(
      `insert into recipes (recipe_title, recipe_class_id, cost, macros, prep_time, instructions, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning recipe_id`,
      [recipe.title, classIds[recipe.meal_class] ?? null, recipe.cost, recipe.macros, recipe.prep_time,
        recipe.steps.map((step, i) => `${i + 1}. ${step}`).join('\n'), userId]
    )
    const recipeId = inserted.rows[0].recipe_id

    for (const [index, ingredient] of recipe.ingredients.entries()) {
      const measureId = measureIds[ingredient.measurement] ?? null

      // Reuse an ingredient with the same name (ignoring case), as
      // scripts/seedRecipes.js does. Nobody's pantry changes: each user's
      // pantry is their own rows in user_pantry.
      const existing = await db.query(
        'select ingredient_id from ingredients where lower(ingredient_name) = lower($1) limit 1',
        [ingredient.name]
      )
      const ingredientId = existing.rows[0]?.ingredient_id ?? (await db.query(
        `insert into ingredients (ingredient_name, measure_amount_id)
         values ($1, $2) returning ingredient_id`,
        [ingredient.name, measureId]
      )).rows[0].ingredient_id

      await db.query(
        `insert into recipe_ingredients (recipe_id, recipe_seq_number, ingredient_id, measure_amount_id, amount)
         values ($1, $2, $3, $4, $5)`,
        [recipeId, index + 1, ingredientId, measureId, ingredient.amount]
      )
    }

    await db.query('commit')
    saved = true
    res.status(201).json({ recipe_id: recipeId, recipe_title: recipe.title, ...(await limitBody(userId)) })
  } catch (error) {
    if (!saved) await db.query('rollback').catch(() => {})
    throw error
  } finally {
    db.release()
    // Not saved (limit, duplicate or an error): keep the draft so the user
    // can press Save again or go back and edit
    if (!saved) await storeDraft(draftId, draft).catch(() => {})
  }
})

export default router
