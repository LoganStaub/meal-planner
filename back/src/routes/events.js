// POST /api/events  { event_name, metadata? }  -> 204
// Lets pages log what users do (front/public/js/events.js). Only names in
// CLIENT_EVENTS are accepted, and the user always comes from the session,
// never from the request body.
import { Router } from 'express'
import { CLIENT_EVENTS, logEvent } from '../events.js'

const router = Router()

// Plenty for a few ids and labels; stops anyone filling the table with junk
const MAX_METADATA_LENGTH = 2000

router.post('/events', async (req, res) => {
  const { event_name: eventName, metadata = null } = req.body ?? {}
  if (typeof eventName !== 'string' || !CLIENT_EVENTS.has(eventName)) {
    return res.status(400).json({ error: 'Unknown event_name' })
  }
  const isObject = metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
  if (metadata !== null && (!isObject || JSON.stringify(metadata).length > MAX_METADATA_LENGTH)) {
    return res.status(400).json({ error: `metadata must be an object under ${MAX_METADATA_LENGTH} characters` })
  }

  await logEvent(req.user.user_id, eventName, metadata)
  res.status(204).end()
})

export default router
