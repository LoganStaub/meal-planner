// The first-visit tour (front/public/js/onboarding.js): /api/me/onboarding
//
//   POST /api/me/onboarding  { status }  -> 204
//        Saves users.onboarding_status (db/migrations/013_onboarding.sql):
//          'skipped'    "No thanks" on the welcome popup
//          'started'    "Show me around". Leaving the tour partway (or
//                       closing the tab) keeps this, which still counts as
//                       done: the welcome popup won't show again.
//          'completed'  reached the last step
//        'skipped' and 'started' only save the first answer. 'completed'
//        also replaces them, e.g. someone who skipped and later replayed the
//        whole tour from the profile menu.
import { Router } from 'express'
import { pool } from '../db.js'
import { logEvent } from '../events.js'

const router = Router()

// status -> which current statuses it may replace
const REPLACES = {
  skipped: [],
  started: [],
  completed: ['skipped', 'started'],
}

router.post('/', async (req, res) => {
  const status = req.body?.status
  if (!Object.hasOwn(REPLACES, status)) {
    return res.status(400).json({ error: "status must be 'skipped', 'started' or 'completed'" })
  }

  const { rowCount } = await pool.query(
    `update users
     set onboarding_status = $2, onboarding_updated_at = now()
     where user_id = $1
       and (onboarding_status is null or onboarding_status = any($3::text[]))`,
    [req.user.user_id, status, REPLACES[status]]
  )

  // Logged here, not from the page, so the events match what was saved.
  if (rowCount > 0) logEvent(req.user.user_id, `onboarding_${status}`)
  res.status(204).end()
})

export default router
