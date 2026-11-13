const list = document.getElementById('item-list')
const countEl = document.getElementById('items-left-text')
const form = document.getElementById('add-form')
const input = document.getElementById('add-input')
const emptyNote = document.getElementById('empty-note')
const errorNote = document.getElementById('error-note')

function updateCount() {
  const left = list.querySelectorAll('.shop-item:not(.done)').length
  countEl.textContent = `${left} ${left === 1 ? 'item' : 'items'} left`
  emptyNote.hidden = list.children.length > 0
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

  li.append(check, text)
  list.appendChild(li)

  input.value = ''
  updateCount()
})