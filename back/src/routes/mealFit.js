// OKR 2: "I found meals I'd actually make", rated 1-5 stars: /api/me/meal-fit
//
// The Home page (front/public/js/index.js) asks after the user swipes past
// all 5 meals. Each user is asked at most once every 7 days, whatever they
// answer (or if they close it), so nobody is asked every time they scroll.
//
// Everything is logged to the events table by the server, never by the page,
// so the "once a week" rule and the 1-5 range can't be skipped:
//   meal_fit_prompt_shown   the popup was shown
//   meal_fit_rated          { rating: 1-5 }
//   meal_fit_dismissed      closed without rating
// The admin page reads them with db/queries/okr2_meal_fit.sql.
import { Router } from 'express'
import { pool } from '../db.js'
import { logEvent } from '../events.js'
import { isRating } from '../validators.js'

const router = Router()

const PROMPT_EVERY = '7 days'

// The user's latest prompt in the last 7 days, and whether it was answered
// (rated or dismissed) yet. null if they haven't been asked in 7 days.
async function recentPrompt(userId) {
  const { rows } = await pool.query(
    `select p.created_at,
            exists (select 1 from events a
                    where a.user_id = p.user_id
                      and a.event_name in ('meal_fit_rated', 'meal_fit_dismissed')
                      and a.created_at >= p.created_at) as answered
     from events p
     where p.user_id = $1
       and p.event_name = 'meal_fit_prompt_shown'
       and p.created_at > now() - $2::interval
     order by p.created_at desc
     limit 1`,
    [userId, PROMPT_EVERY]
  )
  return rows[0] ?? null
}

// POST /api/me/meal-fit/prompt  -> { show: true | false }
// Called when the user reaches the end of the Home feed. If they haven't
// been asked in 7 days, this records the prompt as shown and says to show it.
router.post('/prompt', async (req, res) => {
  if (await recentPrompt(req.user.user_id)) return res.json({ show: false })
  await logEvent(req.user.user_id, 'meal_fit_prompt_shown', { source: 'home_feed_end' })
  res.json({ show: true })
})

// POST /api/me/meal-fit/answer  { rating: 1-5 } or { dismissed: true }  -> 204
// Only accepted for an unanswered prompt from the last 7 days, so each
// prompt counts once. 409 if there's nothing to answer.
router.post('/answer', async (req, res) => {
  const { rating, dismissed } = req.body ?? {}
  if (dismissed !== true && !isRating(rating)) {
    return res.status(400).json({ error: 'Send { rating } (a whole number from 1 to 5) or { dismissed: true }' })
  }

  const prompt = await recentPrompt(req.user.user_id)
  if (!prompt || prompt.answered) {
    return res.status(409).json({ error: 'No rating prompt is waiting for an answer' })
  }

  if (dismissed === true) {
    await logEvent(req.user.user_id, 'meal_fit_dismissed')
  } else {
    await logEvent(req.user.user_id, 'meal_fit_rated', { rating })
  }
  res.status(204).end()
})

export default router
