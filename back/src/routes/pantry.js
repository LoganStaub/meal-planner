// The logged-in user's pantry: /api/me/pantry
//
// A pantry item is a row in user_pantry pointing at the shared ingredients
// list. Adding, renaming or removing an item only changes this user's rows;
// the shared ingredient names are never edited here (admins do that through
// /api/ingredients).
//
// Every item is returned as { ingredient_id, ingredient_name, pantry_amount_id }.
import { Router } from 'express'
import { pool } from '../db.js'
import { isPantryAmount, isPositiveInt } from '../validators.js'

const router = Router()

const selectItem = `
  select up.ingredient_id, i.ingredient_name, up.pantry_amount_id
  from user_pantry up
  join ingredients i on i.ingredient_id = up.ingredient_id`

// Returns the id of the shared ingredient with this name (any capitalization),
// creating it if no ingredient has that name yet.
async function findOrCreateIngredient(client, name) {
  const existing = await client.query(
    `select ingredient_id from ingredients
     where lower(ingredient_name) = lower($1)
     order by ingredient_id
     limit 1`,
    [name]
  )
  if (existing.rows.length > 0) return existing.rows[0].ingredient_id

  const created = await client.query(
    'insert into ingredients (ingredient_name) values ($1) returning ingredient_id',
    [name]
  )
  return created.rows[0].ingredient_id
}

async function getItem(client, userId, ingredientId) {
  const { rows } = await client.query(`${selectItem} where up.user_id = $1 and up.ingredient_id = $2`, [
    userId,
    ingredientId,
  ])
  return rows[0]
}

// Runs fn inside a transaction, so a failed step undoes the earlier ones.
async function inTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

// GET /api/me/pantry  -> this user's items
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `${selectItem} where up.user_id = $1 order by up.pantry_amount_id, lower(i.ingredient_name)`,
    [req.user.user_id]
  )
  res.json(rows)
})

// POST /api/me/pantry  { ingredient_name, pantry_amount_id? }  -> 201 with the new item
router.post('/', async (req, res) => {
  const name = req.body.ingredient_name?.trim()
  const amount = req.body.pantry_amount_id ?? 0
  if (!name) return res.status(400).json({ error: 'ingredient_name is required' })
  if (!isPantryAmount(amount)) return res.status(400).json({ error: 'pantry_amount_id must be 0, 1 or 2' })

  const item = await inTransaction(async (client) => {
    const ingredientId = await findOrCreateIngredient(client, name)
    const { rowCount } = await client.query(
      `insert into user_pantry (user_id, ingredient_id, pantry_amount_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [req.user.user_id, ingredientId, amount]
    )
    if (rowCount === 0) return null
    return getItem(client, req.user.user_id, ingredientId)
  })

  if (!item) return res.status(409).json({ error: `${name} is already in your pantry` })
  res.status(201).json(item)
})

// PATCH /api/me/pantry/:ingredientId  { ingredient_name?, pantry_amount_id? }  -> the saved item
// Renaming points this pantry item at a different shared ingredient, so the
// returned ingredient_id can change.
router.patch('/:ingredientId', async (req, res) => {
  const { ingredientId } = req.params
  const name = req.body.ingredient_name?.trim()
  const amount = req.body.pantry_amount_id

  if (!isPositiveInt(ingredientId)) return res.status(400).json({ error: 'ingredientId must be a positive integer' })
  if ('ingredient_name' in req.body && !name) return res.status(400).json({ error: 'ingredient_name cannot be empty' })
  if (amount !== undefined && !isPantryAmount(amount)) {
    return res.status(400).json({ error: 'pantry_amount_id must be 0, 1 or 2' })
  }

  const result = await inTransaction(async (client) => {
    const current = await getItem(client, req.user.user_id, ingredientId)
    if (!current) return { status: 404, error: 'That ingredient is not in your pantry' }

    let targetId = current.ingredient_id
    if (name && name.toLowerCase() !== current.ingredient_name.toLowerCase()) {
      targetId = await findOrCreateIngredient(client, name)
      if (await getItem(client, req.user.user_id, targetId)) {
        return { status: 409, error: `${name} is already in your pantry` }
      }
      await client.query(
        'update user_pantry set ingredient_id = $3 where user_id = $1 and ingredient_id = $2',
        [req.user.user_id, current.ingredient_id, targetId]
      )
    }

    if (amount !== undefined) {
      await client.query(
        'update user_pantry set pantry_amount_id = $3 where user_id = $1 and ingredient_id = $2',
        [req.user.user_id, targetId, amount]
      )
    }
    return { item: await getItem(client, req.user.user_id, targetId) }
  })

  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result.item)
})

// DELETE /api/me/pantry/:ingredientId  -> 204
router.delete('/:ingredientId', async (req, res) => {
  const { ingredientId } = req.params
  if (!isPositiveInt(ingredientId)) return res.status(400).json({ error: 'ingredientId must be a positive integer' })

  const { rowCount } = await pool.query('delete from user_pantry where user_id = $1 and ingredient_id = $2', [
    req.user.user_id,
    ingredientId,
  ])
  if (rowCount === 0) return res.status(404).json({ error: 'That ingredient is not in your pantry' })
  res.status(204).end()
})

export default router
