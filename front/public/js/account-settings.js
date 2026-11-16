// Account settings popup on the home page (partials/account-dialog.ejs, /api/me/account).
// View and change name, email, phone, photo and profile icon color; remove the optional ones;
// delete the account after typing DELETE and the password.

const accountDialog = document.getElementById('account-dialog')
const accountForm = document.getElementById('account-form')
const accountMessage = document.getElementById('account-message')
const accountSave = document.getElementById('account-save')
const emailPassword = document.getElementById('account-email-password')
const deleteStart = document.getElementById('account-delete-start')
const deleteForm = document.getElementById('account-delete-form')
const deleteMessage = document.getElementById('account-delete-message')
const deleteConfirm = document.getElementById('account-delete-confirm')
const ACCOUNT_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'profile_pic', 'avatar_color']
// The swatch marked data-default is what a user with no saved color sees
const DEFAULT_AVATAR_COLOR = accountForm.querySelector('[name="avatar_color"][data-default]').value

// A field's saved value as the form shows it ('' for an empty optional field)
function savedValue(field) {
  if (field === 'avatar_color') return savedAccount.avatar_color || DEFAULT_AVATAR_COLOR
  return savedAccount[field] || ''
}
let savedAccount = null

function showMessage(element, text, isError) {
  element.textContent = text
  element.hidden = !text
  element.classList.toggle('account-message-error', Boolean(isError))
}

async function accountRequest(method, body) {
  const response = await fetch('/api/me/account', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401 && data.login_url) window.location.href = data.login_url
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), data)
  return data
}

function fillAccountForm(account) {
  savedAccount = account
  for (const field of ACCOUNT_FIELDS) accountForm.elements[field].value = savedValue(field)
  accountForm.elements.current_password.value = ''
  updateEmailPassword()
}

function updateEmailPassword() {
  const changed = savedAccount && accountForm.elements.email.value.trim().toLowerCase() !== savedAccount.email
  emailPassword.hidden = !changed
}

// Keep the name, email and avatars on the page in step with what was saved.
// Elements opt in with data-account="name" | "email" | "avatar".
function updatePage(account) {
  const first = (account.first_name || '').trim()
  const last = (account.last_name || '').trim()
  const name = [first, last].filter(Boolean).join(' ') || account.email
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase() || account.email[0].toUpperCase()

  document.querySelectorAll('[data-account="name"]').forEach((el) => { el.textContent = name })
  document.querySelectorAll('[data-account="email"]').forEach((el) => { el.textContent = account.email })
  document.querySelectorAll('[data-account="avatar"]').forEach((el) => {
    el.style.setProperty('--avatar-color', account.avatar_color || DEFAULT_AVATAR_COLOR)
    el.replaceChildren()
    if (account.profile_pic) {
      const img = document.createElement('img')
      img.src = account.profile_pic
      img.alt = ''
      el.append(img)
    } else {
      el.textContent = initials
    }
  })
}

function resetDeleteForm() {
  deleteForm.reset()
  deleteForm.hidden = true
  deleteStart.hidden = false
  accountForm.hidden = false // show the details form again
  deleteConfirm.disabled = true
  showMessage(deleteMessage, '')
}

async function openAccountDialog() {
  resetDeleteForm()
  showMessage(accountMessage, 'Loading…')
  accountSave.disabled = true
  accountDialog.showModal()
  try {
    fillAccountForm(await accountRequest('GET'))
    showMessage(accountMessage, '')
    accountSave.disabled = false
    accountForm.elements.first_name.focus()
  } catch (error) {
    showMessage(accountMessage, error.message, true)
  }
}

document.getElementById('account-settings-open').addEventListener('click', openAccountDialog)
document.getElementById('account-dialog-close').addEventListener('click', () => accountDialog.close())
document.getElementById('account-cancel').addEventListener('click', () => accountDialog.close())
accountForm.elements.email.addEventListener('input', updateEmailPassword)

// "Remove" empties an optional field; the change is saved with "Save changes"
accountForm.querySelectorAll('[data-clear]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = accountForm.elements[button.dataset.clear]
    input.value = ''
    input.focus()
  })
})

accountForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!savedAccount) return

  const changes = {}
  for (const field of ACCOUNT_FIELDS) {
    const value = accountForm.elements[field].value.trim()
    if (value !== savedValue(field)) changes[field] = value
  }
  if (Object.keys(changes).length === 0) return showMessage(accountMessage, 'Nothing to save.')

  if (!changes.first_name && 'first_name' in changes) return showMessage(accountMessage, "First name can't be empty.", true)
  if (!changes.last_name && 'last_name' in changes) return showMessage(accountMessage, "Last name can't be empty.", true)

  const removing = ['phone', 'profile_pic'].filter((field) => field in changes && !changes[field])
  if (removing.length > 0) {
    const names = removing.map((field) => (field === 'phone' ? 'phone number' : 'profile picture')).join(' and ')
    if (!window.confirm(`Remove your ${names}?`)) return
  }
  if (changes.email) {
    if (!window.confirm(`Change your login email to ${changes.email}? You'll use it the next time you log in.`)) return
    changes.current_password = accountForm.elements.current_password.value
  }

  accountSave.disabled = true
  showMessage(accountMessage, 'Saving…')
  try {
    const account = await accountRequest('PATCH', changes)
    fillAccountForm(account)
    updatePage(account)
    showMessage(accountMessage, 'Changes saved.')
  } catch (error) {
    showMessage(accountMessage, error.message, true)
    if (error.field && accountForm.elements[error.field]) accountForm.elements[error.field].focus()
  } finally {
    accountSave.disabled = false
  }
})

// ---------- Delete account ----------

deleteStart.addEventListener('click', () => {
  // Hide the details form while deleting, so the dialog stays short enough to need no scrolling
  accountForm.hidden = true
  deleteStart.hidden = true
  deleteForm.hidden = false
  deleteForm.elements.password.focus()
})

document.getElementById('account-delete-cancel').addEventListener('click', () => {
  resetDeleteForm()
  deleteStart.focus()
})

// The delete button stays disabled until DELETE is typed exactly and a password is entered
deleteForm.addEventListener('input', () => {
  deleteConfirm.disabled = !(deleteForm.elements.confirm.value === 'DELETE' && deleteForm.elements.password.value)
})

deleteForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const confirmText = deleteForm.elements.confirm.value
  const password = deleteForm.elements.password.value
  if (confirmText !== 'DELETE') return showMessage(deleteMessage, 'Type DELETE (in capital letters) to confirm.', true)
  if (!password) return showMessage(deleteMessage, 'Enter your password.', true)
  if (!window.confirm('Last check: permanently delete your account and all of its data?')) return

  deleteConfirm.disabled = true
  showMessage(deleteMessage, '')
  try {
    const result = await accountRequest('DELETE', { password, confirm: confirmText })
    window.location.href = result.redirect || '/login'
  } catch (error) {
    showMessage(deleteMessage, error.message, true)
    deleteForm.elements.password.value = ''
    deleteForm.elements.password.focus()
  }
})
