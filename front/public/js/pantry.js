// The Pantry page.
//
// Adding an ingredient saves straight away. Changing and deleting go through
// edit mode: one Edit button for the whole list, then
//   - click an ingredient's amount to change it, or
//   - tick ingredients and use "Set to" or Delete to change several at once,
// and nothing is saved until "Save changes". Cancel puts everything back.

const pantryGrid = document.getElementById('grid')
const pantrySearch = document.getElementById('search')
const amountFilterBar = document.getElementById('amount-filter')
const amountFilterButtons = [...amountFilterBar.querySelectorAll('.amount-filter-btn')]
const addForm = document.getElementById('add-form')
const addInput = document.getElementById('add-input')
const addButton = addForm.querySelector('button[type="submit"]')
const itemTemplate = document.getElementById('item-template')
const pantryTotal = document.getElementById('total')
const emptyMessage = document.getElementById('empty')
const feedback = document.getElementById('feedback')

const editStart = document.getElementById('edit-start')
const editCancel = document.getElementById('edit-cancel')
const editSave = document.getElementById('edit-save')
const editBar = document.getElementById('edit-bar')
const editStatus = document.getElementById('edit-status')
const selectAll = document.getElementById('select-all')
const selectedCount = document.getElementById('selected-count')
const deleteSelected = document.getElementById('delete-selected')
const bulkButtons = [...editBar.querySelectorAll('[data-set-status]'), deleteSelected]

// These IDs match pantry_amount_id in the database: 0 = plenty, 1 = low, 2 = none.
const pantryStatuses = [
  { id: 0, key: 'plenty', label: 'Plenty left' },
  { id: 1, key: 'low', label: 'Running low' },
  { id: 2, key: 'none', label: 'None' },
]

// True between pressing Edit and Save/Cancel
let editing = false
// True while Save changes is talking to the server
let saving = false

async function requestApi(path, options = {}) {
  const response = await fetch(path, options)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`)
  }

  return payload
}

// Message under the Add form
function showFeedback(message, isError = false) {
  feedback.textContent = message
  feedback.classList.toggle('is-error', isError)
  feedback.hidden = false
}

// Message above the list (what will change, or how saving went)
function showEditStatus(message, isError = false) {
  editStatus.textContent = message
  editStatus.classList.toggle('is-error', isError)
  editStatus.hidden = !message
}

function findStatus(statusId) {
  return pantryStatuses.find((status) => status.id === Number(statusId)) || pantryStatuses[0]
}

function titleCaseIngredient(name) {
  return String(name).toLocaleLowerCase().replace(
    /(^|[\s-])([\p{L}\p{N}])/gu,
    (_, separator, letter) => separator + letter.toLocaleUpperCase(),
  )
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function allItems() {
  return [...pantryGrid.querySelectorAll('.item')]
}

// ---------- What each row holds while editing ----------
// data-pantry-amount-id is the saved amount. A change waits in
// data-pending-amount-id, and a row to delete gets the class is-removing.

function shownAmount(item) {
  return Number(item.dataset.pendingAmountId ?? item.dataset.pantryAmountId)
}

function isRemoving(item) {
  return item.classList.contains('is-removing')
}

function isChanged(item) {
  return !isRemoving(item) && shownAmount(item) !== Number(item.dataset.pantryAmountId)
}

function isSelected(item) {
  return item.querySelector('.item-select').checked
}

function setPendingAmount(item, statusId) {
  if (Number(statusId) === Number(item.dataset.pantryAmountId)) delete item.dataset.pendingAmountId
  else item.dataset.pendingAmountId = String(statusId)
}

// Draws one row to match its state and the page's mode
function renderItem(item) {
  const status = findStatus(shownAmount(item))
  const name = item.querySelector('.item-name').textContent
  const chip = item.querySelector('button[data-status]')
  const checkbox = item.querySelector('.item-select')
  const removing = isRemoving(item)

  chip.className = `chip ${status.key}`
  chip.dataset.status = status.key
  chip.textContent = status.label
  chip.hidden = removing
  chip.disabled = !editing || saving
  chip.title = editing ? 'Click to change the amount' : ''
  chip.setAttribute('aria-label', editing ? `${name}: ${status.label}. Click to change.` : `${name}: ${status.label}`)

  checkbox.hidden = !editing
  checkbox.disabled = saving
  item.querySelector('.item-removing').hidden = !removing
  item.querySelector('.item-undo').disabled = saving
  item.classList.toggle('is-changed', isChanged(item))
  item.classList.toggle('is-selected', editing && checkbox.checked)
}

// Draws the Edit / Cancel / Save buttons, the tools bar and the summary line
function renderEditTools() {
  const items = allItems()
  const visible = items.filter((item) => !item.hidden)
  const selected = items.filter(isSelected)
  const changed = items.filter(isChanged).length
  const removing = items.filter(isRemoving).length

  editStart.hidden = editing
  editStart.disabled = items.length === 0
  editCancel.hidden = !editing
  editSave.hidden = !editing
  editBar.hidden = !editing
  editCancel.disabled = saving
  editSave.disabled = saving || (changed === 0 && removing === 0)
  editSave.textContent = saving ? 'Saving…' : 'Save changes'
  if (!editing) return

  const visibleSelected = visible.filter(isSelected).length
  selectAll.disabled = saving || visible.length === 0
  selectAll.checked = visible.length > 0 && visibleSelected === visible.length
  selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visible.length
  selectedCount.textContent = selected.length > 0 ? `${selected.length} selected` : 'Select all'
  bulkButtons.forEach((button) => { button.disabled = saving || selected.length === 0 })

  if (!saving && !editStatus.classList.contains('is-error')) {
    const parts = []
    if (changed > 0) parts.push(`${plural(changed, 'amount')} changed`)
    if (removing > 0) parts.push(`${plural(removing, 'ingredient')} to remove`)
    showEditStatus(parts.length > 0
      ? `${parts.join(' · ')}. Press Save changes to keep ${changed + removing === 1 ? 'it' : 'them'}.`
      : 'Click an amount to change it, or tick ingredients to change or delete several at once.')
  }
}

function renderAll() {
  allItems().forEach(renderItem)
  renderEditTools()
}

// Forgets every unsaved change and tick
function clearPending() {
  allItems().forEach((item) => {
    delete item.dataset.pendingAmountId
    item.classList.remove('is-removing')
    item.querySelector('.item-select').checked = false
  })
}

function setEditing(value) {
  editing = value
  document.body.classList.toggle('pantry-editing', editing)
  clearPending()
  editStatus.classList.remove('is-error')
  if (!editing) showEditStatus('')
  renderAll()
}

function createPantryItem(record) {
  const item = itemTemplate.content.firstElementChild.cloneNode(true)
  const name = record.ingredient_name
  const displayName = titleCaseIngredient(name)

  item.dataset.ingredientId = String(record.ingredient_id)
  item.dataset.name = name.toLocaleLowerCase()
  item.dataset.pantryAmountId = String(record.pantry_amount_id ?? 0)
  item.querySelector('.item-name').textContent = displayName
  item.querySelector('.item-select').setAttribute('aria-label', `Select ${displayName}`)
  renderItem(item)

  return item
}

function updateTotal() {
  pantryTotal.textContent = pantryGrid.querySelectorAll('.item').length
}

function sortPantry() {
  const items = allItems()
  items.sort((left, right) => {
    const amountDifference = Number(left.dataset.pantryAmountId) - Number(right.dataset.pantryAmountId)
    if (amountDifference !== 0) return amountDifference

    const leftName = left.querySelector('.item-name').textContent
    const rightName = right.querySelector('.item-name').textContent
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
  })
  items.forEach((item) => pantryGrid.append(item))
}

// The amount chosen under the search box: 0, 1 or 2, or null for All
let amountFilter = null

function setAmountFilter(value) {
  amountFilter = value
  amountFilterButtons.forEach((button) => {
    const buttonValue = button.dataset.amount === '' ? null : Number(button.dataset.amount)
    button.setAttribute('aria-pressed', String(buttonValue === amountFilter))
  })
  filterPantry()
}

// Shows the ingredients that match both the search text and the amount filter.
// The filter goes by the saved amount, so a row doesn't vanish mid-edit.
function filterPantry() {
  const query = pantrySearch.value.trim().toLocaleLowerCase()
  const items = allItems()
  let visibleCount = 0

  items.forEach((item) => {
    const matches = item.dataset.name.includes(query)
      && (amountFilter === null || Number(item.dataset.pantryAmountId) === amountFilter)
    item.hidden = !matches
    if (matches) visibleCount += 1
  })

  emptyMessage.hidden = visibleCount > 0
  if (items.length === 0) {
    emptyMessage.textContent = 'Your pantry is empty. Add an ingredient to get started.'
  } else {
    const amount = amountFilter === null ? '' : ` marked “${findStatus(amountFilter).label}”`
    const search = query ? ` match “${pantrySearch.value.trim()}”` : ''
    emptyMessage.textContent = search
      ? `No ingredients${amount}${search}.`
      : `No ingredients are${amount}.`
  }
  renderEditTools()
}

pantrySearch.addEventListener('input', filterPantry)

amountFilterBar.addEventListener('click', (event) => {
  const button = event.target.closest('.amount-filter-btn')
  if (!button) return
  setAmountFilter(button.dataset.amount === '' ? null : Number(button.dataset.amount))
})

// ---------- Adding (saves straight away) ----------

addForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const ingredientName = addInput.value.trim()

  if (!ingredientName) {
    showFeedback('Enter an ingredient name first.', true)
    addInput.focus()
    return
  }

  addButton.disabled = true
  try {
    const record = await requestApi('/api/me/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // A new ingredient always starts as "Plenty left" (0); change it with Edit
      body: JSON.stringify({ ingredient_name: ingredientName, pantry_amount_id: 0 }),
    })

    pantryGrid.append(createPantryItem(record))
    // Rows stay where they are during an edit, so nothing jumps under the pointer
    if (!editing) sortPantry()
    addInput.value = ''
    updateTotal()
    // New ingredients are "Plenty left": don't let another filter hide it
    if (amountFilter !== null && amountFilter !== Number(record.pantry_amount_id ?? 0)) setAmountFilter(null)
    else filterPantry()
    showFeedback(`${titleCaseIngredient(record.ingredient_name)} added to your pantry.`)
    addInput.focus()
  } catch (error) {
    showFeedback(error.message || 'Could not add that ingredient.', true)
  } finally {
    addButton.disabled = false
  }
})

// ---------- Edit mode ----------

editStart.addEventListener('click', () => setEditing(true))

editCancel.addEventListener('click', () => {
  const hadChanges = allItems().some((item) => isChanged(item) || isRemoving(item))
  setEditing(false)
  if (hadChanges) showEditStatus('Changes discarded.')
  editStart.focus()
})

pantryGrid.addEventListener('click', (event) => {
  if (!editing || saving) return
  const item = event.target.closest('.item')
  if (!item) return

  // Undo a delete that hasn't been saved yet
  if (event.target.closest('.item-undo')) {
    item.classList.remove('is-removing')
    editStatus.classList.remove('is-error')
    renderAll()
    return
  }

  // Clicking the amount steps to the next one: plenty -> low -> none -> plenty
  if (event.target.closest('button[data-status]')) {
    const currentIndex = pantryStatuses.findIndex((status) => status.id === shownAmount(item))
    setPendingAmount(item, pantryStatuses[(currentIndex + 1) % pantryStatuses.length].id)
    editStatus.classList.remove('is-error')
    renderAll()
    return
  }

  // Anywhere else on the row ticks it, like clicking its tick box
  if (!event.target.closest('.item-select') && !isRemoving(item)) {
    const checkbox = item.querySelector('.item-select')
    checkbox.checked = !checkbox.checked
    renderAll()
  }
})

pantryGrid.addEventListener('change', (event) => {
  if (event.target.closest('.item-select')) renderAll()
})

// Ticks or unticks every ingredient on show (a search narrows which those are)
selectAll.addEventListener('change', () => {
  allItems().forEach((item) => {
    if (!item.hidden && !isRemoving(item)) item.querySelector('.item-select').checked = selectAll.checked
  })
  renderAll()
})

// "Set to": the same amount for every ticked ingredient
editBar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-set-status]')
  if (!button) return
  allItems().filter(isSelected).forEach((item) => {
    if (!isRemoving(item)) setPendingAmount(item, button.dataset.setStatus)
  })
  editStatus.classList.remove('is-error')
  renderAll()
})

// Delete: marks the ticked ingredients; they go when the changes are saved
deleteSelected.addEventListener('click', () => {
  allItems().filter(isSelected).forEach((item) => {
    item.classList.add('is-removing')
    item.querySelector('.item-select').checked = false
  })
  editStatus.classList.remove('is-error')
  renderAll()
})

// "Are you sure?" popup: says how many ingredients will be deleted and names
// them. Resolves true only if the user presses the Delete button.
const confirmDialog = document.getElementById('confirm-remove')

function confirmRemoval(removals) {
  const count = removals.length
  const names = removals.map((item) => item.querySelector('.item-name').textContent)
  const keepButton = confirmDialog.querySelector('button[value="cancel"]')

  document.getElementById('confirm-remove-title').textContent = `Delete ${plural(count, 'ingredient')}?`
  document.getElementById('confirm-remove-text').textContent = count === 1
    ? 'You are about to delete 1 ingredient from your pantry. This cannot be undone.'
    : `You are about to delete ${count} ingredients from your pantry. This cannot be undone.`
  document.getElementById('confirm-remove-list').replaceChildren(...names.map((name) => {
    const row = document.createElement('li')
    row.textContent = name
    return row
  }))
  keepButton.textContent = count === 1 ? 'Keep it' : 'Keep them'
  document.getElementById('confirm-remove-yes').textContent = `Delete ${plural(count, 'ingredient')}`

  confirmDialog.returnValue = ''
  confirmDialog.showModal()
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'delete'), { once: true })
  })
}

// Clicking the dimmed background is the same as "Keep them"
confirmDialog.addEventListener('click', (event) => {
  if (event.target === confirmDialog) confirmDialog.close('cancel')
})

editSave.addEventListener('click', async () => {
  const items = allItems()
  const changes = items.filter(isChanged)
  const removals = items.filter(isRemoving)
  if (changes.length === 0 && removals.length === 0) return
  // Deleting can't be undone once saved, so ask first
  if (removals.length > 0 && !(await confirmRemoval(removals))) return

  saving = true
  showEditStatus('')
  renderAll()

  const itemUrl = (item) => `/api/me/pantry/${encodeURIComponent(item.dataset.ingredientId)}`
  // Each ingredient is saved on its own, so one failure doesn't undo the rest
  const results = await Promise.allSettled([
    ...changes.map(async (item) => {
      const record = await requestApi(itemUrl(item), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pantry_amount_id: shownAmount(item) }),
      })
      item.dataset.pantryAmountId = String(record.pantry_amount_id)
      delete item.dataset.pendingAmountId
    }),
    ...removals.map(async (item) => {
      await requestApi(itemUrl(item), { method: 'DELETE' })
      item.remove()
    }),
  ])

  saving = false
  updateTotal()
  const failed = results.filter((result) => result.status === 'rejected').length

  if (failed > 0) {
    // Stay in edit mode: what didn't save is still marked, ready to try again
    editStatus.classList.add('is-error')
    showEditStatus(`${plural(failed, 'change')} couldn't be saved. Press Save changes to try again.`, true)
    filterPantry()
    renderAll()
    return
  }

  setEditing(false)
  sortPantry()
  filterPantry()
  const parts = []
  if (changes.length > 0) parts.push(`${plural(changes.length, 'amount')} updated`)
  if (removals.length > 0) parts.push(`${plural(removals.length, 'ingredient')} removed`)
  showEditStatus(`Saved: ${parts.join(', ')}.`)
  editStart.focus()
})

sortPantry()
updateTotal()
filterPantry()
renderAll()
