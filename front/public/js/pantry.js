const pantryGrid = document.getElementById('grid')
const pantrySearch = document.getElementById('search')
const addForm = document.getElementById('add-form')
const addInput = document.getElementById('add-input')
const addStatus = document.getElementById('add-status')
const addButton = addForm.querySelector('button[type="submit"]')
const itemTemplate = document.getElementById('item-template')
const pantryTotal = document.getElementById('total')
const emptyMessage = document.getElementById('empty')
const feedback = document.getElementById('feedback')

// These IDs match pantry_amount_id in the database: 0 = plenty, 1 = low, 2 = none.
const pantryStatuses = [
  { id: 0, key: 'plenty', label: 'Plenty left' },
  { id: 1, key: 'low', label: 'Running low' },
  { id: 2, key: 'none', label: 'None' },
]

async function requestApi(path, options = {}) {
  const response = await fetch(path, options)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`)
  }

  return payload
}

function showFeedback(message, isError = false) {
  feedback.textContent = message
  feedback.classList.toggle('is-error', isError)
  feedback.hidden = false
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

function renderStatus(itemElement, statusId) {
  const status = findStatus(statusId)
  const button = itemElement.querySelector('button[data-status]')
  const name = itemElement.querySelector('.item-name').textContent

  itemElement.dataset.pantryAmountId = String(status.id)
  button.className = `chip ${status.key}`
  button.dataset.status = status.key
  button.textContent = status.label
  button.setAttribute('aria-label', `Inventory status for ${name}: ${status.label}`)
  syncRowControls(itemElement)
}

function createPantryItem(record) {
  const item = itemTemplate.content.firstElementChild.cloneNode(true)
  const name = record.ingredient_name
  const displayName = titleCaseIngredient(name)

  item.dataset.ingredientId = String(record.ingredient_id)
  item.dataset.name = name.toLocaleLowerCase()
  item.querySelector('.item-name').textContent = displayName
  item.querySelector('.item-name-input').value = name
  item.querySelector('.item-name-input').setAttribute('aria-label', `Edit ${displayName}`)
  item.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit ${displayName}`)
  item.querySelector('.del').setAttribute('aria-label', `Remove ${displayName}`)
  renderStatus(item, record.pantry_amount_id ?? 0)
  syncRowControls(item)

  return item
}

function updateTotal() {
  pantryTotal.textContent = pantryGrid.querySelectorAll('.item').length
}

function sortPantry() {
  const items = [...pantryGrid.querySelectorAll('.item')]
  items.sort((left, right) => {
    const amountDifference = Number(left.dataset.pantryAmountId) - Number(right.dataset.pantryAmountId)
    if (amountDifference !== 0) return amountDifference

    const leftName = left.querySelector('.item-name').textContent
    const rightName = right.querySelector('.item-name').textContent
    return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
  })
  items.forEach((item) => pantryGrid.append(item))
}

function filterPantry() {
  const query = pantrySearch.value.trim().toLocaleLowerCase()
  const items = [...pantryGrid.querySelectorAll('.item')]
  let visibleCount = 0

  items.forEach((item) => {
    const matches = item.dataset.name.includes(query)
    item.hidden = !matches
    if (matches) visibleCount += 1
  })

  emptyMessage.hidden = visibleCount > 0
  emptyMessage.textContent = items.length === 0
    ? 'Your pantry is empty. Add an ingredient to get started.'
    : `No ingredients match “${pantrySearch.value.trim()}”.`
}

function setRowBusy(item, busy) {
  item.setAttribute('aria-busy', String(busy))
  syncRowControls(item)
}

function syncRowControls(item) {
  const busy = item.getAttribute('aria-busy') === 'true'
  const editing = item.classList.contains('is-editing')

  item.querySelectorAll('button, input').forEach((control) => {
    const editOnly = control.matches('button[data-status], .item-name-input, .del')
    control.disabled = busy || (editOnly && !editing)
  })

  const statusButton = item.querySelector('button[data-status]')
  const name = item.querySelector('.item-name').textContent
  const statusLabel = findStatus(item.dataset.pantryAmountId).label
  statusButton.title = editing ? 'Status change is not saved until you click Save' : 'Click Edit to change inventory status'
  statusButton.setAttribute(
    'aria-label',
    editing
      ? `Inventory status for ${name}: ${statusLabel}. Click to change; save to apply.`
      : `Inventory status for ${name}: ${statusLabel}. Click Edit to change it.`
  )
}

function setEditing(item, editing) {
  const name = item.querySelector('.item-name').textContent
  const input = item.querySelector('.item-name-input')

  if (editing) {
    item.dataset.originalName = name
    item.dataset.originalPantryAmountId = item.dataset.pantryAmountId
  }

  item.classList.toggle('is-editing', editing)
  input.hidden = !editing
  item.querySelector('[data-action="edit"]').hidden = editing
  item.querySelector('[data-action="save"]').hidden = !editing
  item.querySelector('[data-action="cancel"]').hidden = !editing
  item.querySelector('.del').hidden = !editing

  if (editing) {
    input.value = name
    input.setAttribute('aria-label', `Edit ${name}`)
  } else {
    input.value = name
    delete item.dataset.originalName
    delete item.dataset.originalPantryAmountId
  }

  syncRowControls(item)

  if (editing) {
    input.focus()
    input.select()
  }
}

function cancelEditing(item) {
  renderStatus(item, item.dataset.originalPantryAmountId)
  setEditing(item, false)
  showFeedback('Changes discarded.')
}

pantrySearch.addEventListener('input', filterPantry)

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
    const record = await requestApi('/api/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_name: ingredientName,
        pantry_amount_id: Number(addStatus.value),
      }),
    })

    pantryGrid.append(createPantryItem(record))
    sortPantry()
    addInput.value = ''
    updateTotal()
    filterPantry()
    showFeedback(`${titleCaseIngredient(record.ingredient_name)} added to your pantry.`)
    addInput.focus()
  } catch (error) {
    showFeedback(error.message || 'Could not add that ingredient.', true)
  } finally {
    addButton.disabled = false
  }
})

pantryGrid.addEventListener('click', async (event) => {
  const item = event.target.closest('.item')
  if (!item) return

  const actionButton = event.target.closest('button[data-action]')
  if (actionButton?.dataset.action === 'edit') {
    setEditing(item, true)
    return
  }

  if (actionButton?.dataset.action === 'cancel') {
    cancelEditing(item)
    return
  }

  if (actionButton?.dataset.action === 'save') {
    const input = item.querySelector('.item-name-input')
    const ingredientName = input.value.trim()
    const originalName = item.dataset.originalName
    const pantryAmountId = Number(item.dataset.pantryAmountId)
    const originalPantryAmountId = Number(item.dataset.originalPantryAmountId)

    if (!ingredientName) {
      showFeedback('Ingredient name cannot be empty.', true)
      input.focus()
      return
    }

    if (ingredientName === originalName && pantryAmountId === originalPantryAmountId) {
      setEditing(item, false)
      showFeedback('No changes to save.')
      return
    }

    setRowBusy(item, true)
    try {
      const record = await requestApi(`/api/ingredients/${encodeURIComponent(item.dataset.ingredientId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredient_name: ingredientName, pantry_amount_id: pantryAmountId }),
      })
      const savedName = record.ingredient_name
      const displayName = titleCaseIngredient(savedName)
      item.querySelector('.item-name').textContent = displayName
      item.dataset.name = savedName.toLocaleLowerCase()
      item.querySelector('.del').setAttribute('aria-label', `Remove ${displayName}`)
      item.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit ${displayName}`)
      renderStatus(item, record.pantry_amount_id ?? item.dataset.pantryAmountId)
      setEditing(item, false)
      sortPantry()
      filterPantry()
      showFeedback(`${displayName} saved.`)
    } catch (error) {
      showFeedback(error.message || 'Could not save that ingredient name.', true)
    } finally {
      setRowBusy(item, false)
    }
    return
  }

  const statusButton = event.target.closest('button[data-status]')
  if (statusButton) {
    if (!item.classList.contains('is-editing')) return

    const currentStatusId = Number(item.dataset.pantryAmountId)
    const currentIndex = pantryStatuses.findIndex((status) => status.id === currentStatusId)
    const nextStatus = pantryStatuses[(currentIndex + 1) % pantryStatuses.length]
    renderStatus(item, nextStatus.id)
    showFeedback(`${item.querySelector('.item-name').textContent}: ${nextStatus.label} selected. Click Save to apply.`)
    return
  }

  const deleteButton = event.target.closest('button.del')
  if (!deleteButton) return
  if (!item.classList.contains('is-editing')) return

  const ingredientName = item.querySelector('.item-name').textContent
  if (!window.confirm(`Remove ${ingredientName} from your pantry?`)) return

  setRowBusy(item, true)
  try {
    await requestApi(`/api/ingredients/${encodeURIComponent(item.dataset.ingredientId)}`, {
      method: 'DELETE',
    })
    item.remove()
    updateTotal()
    filterPantry()
    showFeedback(`${ingredientName} removed from your pantry.`)
  } catch (error) {
    showFeedback(error.message || 'Could not remove that ingredient.', true)
  } finally {
    if (item.isConnected) setRowBusy(item, false)
  }
})

pantryGrid.addEventListener('keydown', (event) => {
  const input = event.target.closest('.item-name-input')
  if (!input) return

  const item = input.closest('.item')
  if (event.key === 'Enter') {
    event.preventDefault()
    item.querySelector('[data-action="save"]').click()
  } else if (event.key === 'Escape') {
    cancelEditing(item)
  }
})

pantryGrid.querySelectorAll('.item').forEach(syncRowControls)
sortPantry()
updateTotal()
filterPantry()
