// Included on every page that needs a logged-in user.
// Some browsers (Safari especially) keep a page in memory and show it again
// when you press Back, without asking the server. If that happens, reload
// it so the server can check the login and send logged-out visitors to /login.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})
