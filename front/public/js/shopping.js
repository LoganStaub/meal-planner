const list = document.getElementById('item-list')
const countEl = document.getElementById('items-left-text')
const form = document.getElementById('add-form')
const input = document.getElementById('add-input')
const emptyNote = document.getElementById('empty-note')
const errorNote = document.getElementById('error-note')

const editStart = document.getElementById('edit-start')
const editDone = document.getElementById('edit-done')
const editBar = document.getElementById('edit-bar')
const selectAll = document.getElementById('select-all')
const selectedCount = document.getElementById('selected-count')
const removeSelected = document.getElementById('remove-selected')
const confirmDialog = document.getElementById('confirm-remove')

// True between pressing Edit and Done
let editing = false

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function updateCount() {
  const left = list.querySelectorAll('.shop-item:not(.done)').length
  countEl.textContent = `${left} ${left === 1 ? 'item' : 'items'} left`
  emptyNote.hidden = list.children.length > 0
  editStart.disabled = list.children.length === 0
}

function showError(message) {
  errorNote.textContent = message
  errorNote.hidden = !message
}

// Tells the server this ingredient is now in the pantry (got) or not (!got)
async function saveGot(ingredientId, got) {
  const response = await fetch(`/api/me/shopping/${ingredientId}/got`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ got }),
  })
  // A redirect means the login session ran out
  if (!response.ok || response.redirected) throw new Error(`Save failed (${response.status})`)
}

list.addEventListener('change', async (event) => {
  const check = event.target
  if (!check.classList.contains('shop-check')) return

  const item = check.closest('.shop-item')
  const got = check.checked
  item.classList.toggle('done', got)
  updateCount()
  showError('')

  // Items typed into "Add something else" have no ingredient id, so they stay on this page only
  const ingredientId = item.dataset.ingredientId
  if (!ingredientId) return

  check.disabled = true
  try {
    await saveGot(ingredientId, got)
  } catch (error) {
    console.error(error)
    // Put the box back the way it was, since the pantry wasn't updated
    check.checked = !got
    item.classList.toggle('done', !got)
    updateCount()
    showError('Could not save that. Check your connection or log in again, then try once more.')
  } finally {
    check.disabled = false
  }
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const name = input.value.trim()
  if (!name) return

  const li = document.createElement('li')
  li.className = 'shop-item'

  const select = document.createElement('input')
  select.type = 'checkbox'
  select.className = 'item-select shop-select'
  select.setAttribute('aria-label', `Select ${name}`)
  select.hidden = !editing

  const check = document.createElement('input')
  check.type = 'checkbox'
  check.className = 'shop-check'
  check.setAttribute('aria-label', `Got ${name}`)

  const text = document.createElement('div')
  text.className = 'shop-text'
  const nameEl = document.createElement('span')
  nameEl.className = 'shop-name'
  nameEl.textContent = name
  text.appendChild(nameEl)

  li.append(select, check, text)
  list.appendChild(li)

  input.value = ''
  updateCount()
  renderSelection()
})

// ---------- Edit mode: remove items ----------
// Edit shows a checkbox on every item. Tick some (or Select all), press
// Remove, and confirm. Items from the meal plan are saved as removed
// (POST /api/me/shopping/remove); items typed into "Add something else"
// only live on this page, so they're just taken off it.

const items = () => [...list.querySelectorAll('.shop-item')]
const selectedItems = () => items().filter((item) => item.querySelector('.shop-select').checked)

function setEditing(value) {
  editing = value
  document.body.classList.toggle('shop-editing', editing)
  editStart.hidden = editing
  editDone.hidden = !editing
  editBar.hidden = !editing
  for (const item of items()) {
    const select = item.querySelector('.shop-select')
    select.hidden = !editing
    select.checked = false
  }
  showError('')
  renderSelection()
  if (editing) selectAll.focus()
  else editStart.focus()
}

function renderSelection() {
  const all = items()
  const count = selectedItems().length
  for (const item of all) item.classList.toggle('is-selected', editing && item.querySelector('.shop-select').checked)
  selectedCount.textContent = count === 0 ? 'Select all' : `${count} selected`
  selectAll.checked = all.length > 0 && count === all.length
  selectAll.indeterminate = count > 0 && count < all.length
  removeSelected.disabled = count === 0
}

// "Are you sure?" popup naming the items. Resolves true only for Remove.
function confirmRemoval(selected) {
  const count = selected.length
  document.getElementById('confirm-remove-title').textContent = `Remove ${plural(count, 'item')}?`
  document.getElementById('confirm-remove-text').textContent =
    `${count === 1 ? 'It' : 'They'} will be taken off your shopping list. Your meal plan and pantry stay the same.`
  document.getElementById('confirm-remove-list').replaceChildren(...selected.map((item) => {
    const row = document.createElement('li')
    row.textContent = item.querySelector('.shop-name').textContent
    return row
  }))
  confirmDialog.querySelector('button[value="cancel"]').textContent = count === 1 ? 'Keep it' : 'Keep them'
  document.getElementById('confirm-remove-yes').textContent = `Remove ${plural(count, 'item')}`

  confirmDialog.returnValue = ''
  confirmDialog.showModal()
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'remove'), { once: true })
  })
}

editStart.addEventListener('click', () => setEditing(true))
editDone.addEventListener('click', () => setEditing(false))

selectAll.addEventListener('change', () => {
  for (const item of items()) item.querySelector('.shop-select').checked = selectAll.checked
  renderSelection()
})

list.addEventListener('change', (event) => {
  if (event.target.classList.contains('shop-select')) renderSelection()
})

// While editing, a click anywhere on an item ticks it
list.addEventListener('click', (event) => {
  if (!editing || event.target.classList.contains('shop-select')) return
  const item = event.target.closest('.shop-item')
  if (!item) return
  const select = item.querySelector('.shop-select')
  select.checked = !select.checked
  renderSelection()
})

removeSelected.addEventListener('click', async () => {
  const selected = selectedItems()
  if (selected.length === 0 || !(await confirmRemoval(selected))) return

  const ids = selected.map((item) => Number(item.dataset.ingredientId)).filter(Boolean)
  removeSelected.disabled = true
  showError('')
  try {
    if (ids.length > 0) {
      const response = await fetch('/api/me/shopping/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredient_ids: ids }),
      })
      // A redirect means the login session ran out
      if (!response.ok || response.redirected) throw new Error(`Remove failed (${response.status})`)
    }
    selected.forEach((item) => item.remove())
    updateCount()
    if (list.children.length === 0) setEditing(false)
    else renderSelection()
  } catch (error) {
    console.error(error)
    showError('Could not remove those. Check your connection or log in again, then try once more.')
    renderSelection()
  }
})