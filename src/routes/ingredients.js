// Virtual Pantry: /api/ingredients
import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

// GET /api/ingredients  -> every ingredient, oldest first
router.get('/', async (req, res) => {
  const { rows } = await pool.query('select * from ingredients order by ingredient_id')
  res.json(rows)
})

// POST /api/ingredients  { ingredient_name, pantry_amount_id? }  -> the new row
router.post('/', async (req, res) => {
  const name = req.body.ingredient_name?.trim()
  if (!name) {
    return res.status(400).json({ error: 'ingredient_name is required' })
  }

  const { rows } = await pool.query(
    `insert into ingredients (ingredient_name, pantry_amount_id, measure_amount_id)
     values ($1, $2, $3)
     returning *`,
    [name, req.body.pantry_amount_id ?? 0, req.body.measure_amount_id ?? null]
  )
  res.status(201).json(rows[0])
})

// PATCH /api/ingredients/:id  { ingredient_name?, pantry_amount_id?, measure_amount_id? }
router.patch('/:id', async (req, res) => {
  const editable = ['ingredient_name', 'pantry_amount_id', 'measure_amount_id']
  const fields = editable.filter((field) => field in req.body)

  if (fields.length === 0) {
    return res.status(400).json({ error: `Send at least one of: ${editable.join(', ')}` })
  }
  if ('ingredient_name' in req.body && !req.body.ingredient_name?.trim()) {
    return res.status(400).json({ error: 'ingredient_name cannot be empty' })
  }

  // Column names come from the fixed list above, never from the request,
  // so building the SET clause this way is safe from SQL injection.
  const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ')
  const values = fields.map((field) =>
    field === 'ingredient_name' ? req.body[field].trim() : req.body[field]
  )

  const { rows } = await pool.query(
    `update ingredients set ${setClause} where ingredient_id = $${fields.length + 1} returning *`,
    [...values, req.params.id]
  )
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Ingredient not found' })
  }
  res.json(rows[0])
})

// DELETE /api/ingredients/:id
router.delete('/:id', async (req, res) => {
  const { rowCount } = await pool.query('delete from ingredients where ingredient_id = $1', [
    req.params.id,
  ])
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Ingredient not found' })
  }
  res.status(204).end()
})

export default router
