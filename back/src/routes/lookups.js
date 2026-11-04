// Lookup tables: /api/recipe-classes and /api/measurements
import { Router } from 'express'
import { pool } from '../db.js'

const router = Router()

router.get('/recipe-classes', async (req, res) => {
  const { rows } = await pool.query('select * from recipe_classes order by recipe_class_id')
  res.json(rows)
})

router.get('/measurements', async (req, res) => {
  const { rows } = await pool.query('select * from measurements order by measure_amount_id')
  res.json(rows)
})

export default router
