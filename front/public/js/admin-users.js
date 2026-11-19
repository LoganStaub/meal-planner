// Maintain Users page (/admin/users). Lists every user and lets an admin add,
// edit and delete them through /api/admin/users (routes/adminUsers.js).
// The server checks that the person is an admin on every request; this file
// only draws the page and sends the requests.

(() => {

const page = document.getElementById('manage-page')
const currentUserId = Number(page.dataset.currentUserId)
const tableBody = document.getElementById('manage-rows')
const emptyNote = document.getElementById('manage-empty')
const countNote = document.getElementById('manage-count')
const statusNote = document.getElementById('manage-status')
const filterInput = document.getElementById('manage-filter')

const formDialog = document.getElementById('user-dialog')
const form = document.getElementById('user-form')
const formTitle = document.getElementById('user-dialog-title')
const formError = document.getElementById('user-error')
const saveButton = document.getElementById('user-save')
const passwordInput = document.getElementById('user-password')
const passwordHint = document.getElementById('user-password-hint')
const adminBox = document.getElementById('user-is-admin')

const deleteDialog = document.getElementById('delete-dialog')
const deleteText = document.getElementById('delete-text')
const deleteError = document.getElementById('delete-error')
const deleteConfirm = document.getElementById('delete-confirm')

let users = []          // every user, from the server
let editingId = null    // the user being edited, or null when adding a new one
let deletingUser = null // the user the delete popup is asking about

// Sends a request to the admin API. Resolves with the JSON reply (or null for
// "204 No Content") and throws an Error with the server's message if it fails.
async function api(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

// The green "Saved." line (or a red error) above the table
let statusTimer = null
function showStatus(message, isError = false) {
  clearTimeout(statusTimer)
  statusNote.textContent = message
  statusNote.classList.toggle('error', isError)
  statusNote.hidden = false
  if (!isError) statusTimer = setTimeout(() => { statusNote.hidden = true }, 4000)
}

async function loadUsers() {
  try {
    users = await api('/api/admin/users')
    renderUsers()
  } catch (error) {
    showStatus(`Couldn't load users: ${error.message}`, true)
  }
}

function cell(text) {
  const td = document.createElement('td')
  td.textContent = text
  return td
}

function actionButton(label, action, extraClass = '') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `manage-btn secondary ${extraClass}`.trim()
  button.dataset.action = action
  button.textContent = label
  return button
}

// One table row. Text is set with textContent, never as HTML, so a name like
// "<b>" can't change the page.
function userRow(user) {
  const row = document.createElement('tr')
  row.dataset.userId = user.user_id
  row.append(cell(`${user.first_name} ${user.last_name}`), cell(user.email), cell(user.phone || '—'))

  const roleCell = document.createElement('td')
  const badge = document.createElement('span')
  badge.className = user.is_admin ? 'manage-badge admin' : 'manage-badge'
  badge.textContent = user.is_admin ? 'Admin' : 'User'
  roleCell.append(badge)

  const actions = document.createElement('td')
  actions.className = 'manage-actions'
  const deleteButton = actionButton('Delete', 'delete')
  if (user.user_id === currentUserId) {
    // You can't delete the account you're logged in with
    deleteButton.disabled = true
    deleteButton.title = "You can't delete your own account"
  }
  actions.append(actionButton('Edit', 'edit'), deleteButton)

  row.append(roleCell, actions)
  return row
}

// Draws the table, keeping only the users that match the search box
function renderUsers() {
  const filter = filterInput.value.trim().toLowerCase()
  const shown = users.filter((user) =>
    `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(filter)
  )
  tableBody.replaceChildren(...shown.map(userRow))
  emptyNote.hidden = shown.length > 0
  countNote.textContent = `${shown.length} of ${users.length} users`
}

filterInput.addEventListener('input', renderUsers)

// ---------- Add / edit ----------

// Opens the popup empty (Add) or filled in with a user (Edit)
function openForm(user) {
  form.reset()
  formError.hidden = true
  editingId = user ? user.user_id : null
  formTitle.textContent = user ? 'Edit user' : 'Add user'

  if (user) {
    form.first_name.value = user.first_name
    form.last_name.value = user.last_name
    form.email.value = user.email
    form.phone.value = user.phone || ''
    adminBox.checked = user.is_admin
  }
  // A new user needs a password; when editing, a blank one means "keep it"
  passwordInput.required = !user
  passwordHint.textContent = user
    ? 'Leave blank to keep the current password. A new one logs them out everywhere.'
    : 'At least 8 characters.'
  // An admin can't remove their own admin access (the server blocks it too)
  adminBox.disabled = Boolean(user) && user.user_id === currentUserId

  formDialog.showModal()
}

document.getElementById('manage-add').addEventListener('click', () => openForm(null))

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const data = new FormData(form)
  const body = {
    first_name: data.get('first_name'),
    last_name: data.get('last_name'),
    email: data.get('email'),
    phone: data.get('phone'),
  }
  // Disabled boxes aren't sent, so your own admin access never changes here
  if (!adminBox.disabled) body.is_admin = adminBox.checked
  const password = data.get('password')
  if (password) body.password = password

  formError.hidden = true
  saveButton.disabled = true
  try {
    if (editingId === null) await api('/api/admin/users', 'POST', body)
    else await api(`/api/admin/users/${editingId}`, 'PATCH', body)
    formDialog.close()
    showStatus(editingId === null ? 'User added.' : 'User saved.')
    await loadUsers()
  } catch (error) {
    formError.textContent = error.message
    formError.hidden = false
  } finally {
    saveButton.disabled = false
  }
})

// ---------- Delete ----------

function openDelete(user) {
  deletingUser = user
  deleteError.hidden = true
  deleteText.textContent =
    `${user.first_name} ${user.last_name} (${user.email}) will be deleted for good, ` +
    'along with their meal plan, pantry, liked recipes and ratings.'
  deleteDialog.showModal()
}

deleteConfirm.addEventListener('click', async () => {
  deleteConfirm.disabled = true
  try {
    await api(`/api/admin/users/${deletingUser.user_id}`, 'DELETE')
    deleteDialog.close()
    showStatus('User deleted.')
    await loadUsers()
  } catch (error) {
    deleteError.textContent = error.message
    deleteError.hidden = false
  } finally {
    deleteConfirm.disabled = false
  }
})

// Edit / Delete buttons in the table (one listener for every row)
tableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]')
  if (!button) return
  const user = users.find((u) => u.user_id === Number(button.closest('tr').dataset.userId))
  if (!user) return
  if (button.dataset.action === 'edit') openForm(user)
  else openDelete(user)
})

// Cancel buttons, and clicking the dimmed area outside a popup, close it
for (const dialog of document.querySelectorAll('dialog.manage-dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close()
  })
}

loadUsers()

})()