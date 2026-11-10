// Who is making this request?
//
// Routes that belong to one person (for example routes/recipeAssistant.js)
// use requireUser, then read req.userId. The id always comes from the login
// session on the server, never from the URL or the request body, so a user
// can't act as somebody else by changing a number.
//
// LOGIN IS NOT BUILT YET. When it is, getUserId() below is the only place
// that needs to change: make it return the logged-in user's users.user_id.
// It already understands the two usual setups:
//   * express-session:  req.session.userId = user.user_id   (set at login)
//   * Passport:         req.user = { user_id, … }
//
// Until then, set DEV_USER_ID=1 in back/.env and every request is treated as
// that user. Leave DEV_USER_ID out of the deployed app's settings.

// Where the 401 response sends people. Change it to match the login page.
export const LOGIN_PATH = '/login'

function asUserId(value) {
  return /^[1-9]\d*$/.test(String(value ?? '')) ? String(value) : null
}

// The logged-in user's id as a string such as '1', or null if nobody is logged in.
export function getUserId(req) {
  const fromLogin = asUserId(req.session?.userId ?? req.session?.user?.user_id ?? req.user?.user_id)
  if (fromLogin) return fromLogin

  // Stand-in until login exists (see the note at the top of this file)
  return asUserId(process.env.DEV_USER_ID)
}

// Express middleware: answers 401 unless someone is logged in.
export function requireUser(req, res, next) {
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({
      error: 'Please log in to do that.',
      code: 'login_required',
      login_url: LOGIN_PATH,
    })
  }
  req.userId = userId
  next()
}
