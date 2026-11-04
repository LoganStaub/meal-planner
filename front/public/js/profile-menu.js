const profileTrigger = document.getElementById('profile-trigger')
const profileMenu = document.getElementById('profile-menu')
const profileMenuClose = document.getElementById('profile-menu-close')

function closeProfileMenu() {
  profileMenu.hidden = true
  profileTrigger.setAttribute('aria-expanded', 'false')
}

profileTrigger.addEventListener('click', () => {
  const shouldOpen = profileMenu.hidden
  profileMenu.hidden = !shouldOpen
  profileTrigger.setAttribute('aria-expanded', String(shouldOpen))

  if (shouldOpen) profileMenuClose.focus()
})

profileMenuClose.addEventListener('click', () => {
  closeProfileMenu()
  profileTrigger.focus()
})

document.addEventListener('click', (event) => {
  if (!profileMenu.hidden && !profileMenu.contains(event.target) && !profileTrigger.contains(event.target)) {
    closeProfileMenu()
  }
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !profileMenu.hidden) {
    closeProfileMenu()
    profileTrigger.focus()
  }
})
