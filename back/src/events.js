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
  'add_to_calendar_started',
  'add_to_calendar_cancelled',
  'add_to_calendar_error',
  // OKR 1 (db/queries/okr1_discover_save.sql). recipe_saved is logged by
  // the server (src/routes/likes.js), not the page.
  'discover_viewed',       // the Home swipe feed loaded
  'save_intent_answered',  // { recipe_id, answer: 'yes' | 'no' } "Would you make this?"
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
