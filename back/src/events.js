// Logs what users do to the events table (db/migrations/009_events.sql),
// so the admin page can measure OKRs (src/routes/admin.js).
//
//   import { logEvent } from './events.js'
//   logEvent(req.user.user_id, 'add_to_calendar_completed', { recipe_id: 3 })
//
// Pages log through POST /api/events (src/routes/events.js) with
// window.logEvent() from front/public/js/events.js.
import { pool } from './db.js'

// The only event names pages may send. Events that prove something really
// happened (like add_to_calendar_completed) are logged by the server only,
// so they can't be faked from the browser. Add new names here.
export const CLIENT_EVENTS = new Set([
  // The first-visit tour (js/onboarding.js). onboarding_skipped / _started /
  // _completed are logged by the server (routes/onboarding.js).
  'onboarding_step_viewed',

  'add_to_calendar_started',
  'add_to_calendar_cancelled',
  'add_to_calendar_error',
])

// Never throws and never needs awaiting: a failed log is printed and
// ignored, so tracking can't break what the user was doing.
export async function logEvent(userId, eventName, metadata = null) {
  try {
    await pool.query(
      'insert into events (user_id, event_name, metadata) values ($1, $2, $3)',
      [userId, eventName, metadata]
    )
  } catch (error) {
    console.error(`Could not log event "${eventName}":`, error.message)
  }
}
