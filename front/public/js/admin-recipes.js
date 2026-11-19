// Maintain Recipes page (/admin/recipes). Lists every recipe and lets an admin
// add, edit and delete them through /api/admin/recipes (routes/adminRecipes.js).
// The server checks that the person is an admin on every request; this file
// only draws the page and sends the requests.

(() => {
const tableBody = document.getElementById('manage-rows')
const emptyNote = document.getElementById('manage-empty')
const countNote = document.getElementById('manage-count')
const statusNote = document.getElementById('manage-status')
const filterInput = document.getElementById('manage-filter')

const formDialog = document.getElementById('recipe-dialog')
const form = document.getElementById('recipe-form')
const formTitle = document.getElementById('recipe-dialog-title')
const formError = document.getElementById('recipe-error')
const saveButton = document.getElementById('recipe-save')
const classSelect = document.getElementById('recipe-class')

const deleteDialog = document.getElementById('delete-dialog')
const deleteText = document.getElementById('delete-text')
const deleteError = document.getElementById('delete-error')
const deleteConfirm = document.getElementById('delete-confirm')

let recipes = []          // every recipe, from the server
let classes = []          // meal types for the dropdown
let editingId = null      // the recipe being edited, or null when adding a new one
let deletingRecipe = null // the recipe the delete popup is asking about

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

async function loadRecipes() {
  try {
    const data = await api('/api/admin/recipes')
    recipes = data.recipes
    classes = data.classes
    fillClassSelect()
    renderRecipes()
  } catch (error) {
    showStatus(`Couldn't load recipes: ${error.message}`, true)
  }
}

// The meal type dropdown in the popup
function fillClassSelect() {
  classSelect.replaceChildren(new Option('None', ''))
  for (const mealClass of classes) {
    classSelect.append(new Option(mealClass.recipe_class_desc, mealClass.recipe_class_id))
  }
}

// 45 -> "45 min", 130 -> "2 hr 10 min"
function formatPrep(minutes) {
  if (minutes == null) return '—'
  const total = Math.round(Number(minutes))
  if (total < 60) return `${total} min`
  const rest = total % 60
  return rest ? `${Math.floor(total / 60)} hr ${rest} min` : `${Math.floor(total / 60)} hr`
}

function formatCost(cost) {
  if (cost == null) return '—'
  return Number.isFinite(Number(cost)) ? `$${Number(cost).toFixed(2)}` : String(cost)
}

function cell(text) {
  const td = document.createElement('td')
  td.textContent = text
  return td
}

function actionButton(label, action) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'manage-btn secondary'
  button.dataset.action = action
  button.textContent = label
  return button
}

// One table row. Text is set with textContent, never as HTML, so a title
// containing "<b>" can't change the page.
function recipeRow(recipe) {
  const row = document.createElement('tr')
  row.dataset.recipeId = recipe.recipe_id

  const photoCell = document.createElement('td')
  if (recipe.image_path) {
    const photo = document.createElement('img')
    photo.className = 'manage-thumb'
    photo.src = recipe.image_path
    photo.alt = ''
    photo.loading = 'lazy'
    photoCell.append(photo)
  } else {
    const empty = document.createElement('span')
    empty.className = 'manage-thumb'
    photoCell.append(empty)
  }

  // The title opens the recipe's own page
  const titleCell = document.createElement('td')
  const link = document.createElement('a')
  link.href = `/recipes/${recipe.recipe_id}`
  link.textContent = recipe.recipe_title
  titleCell.append(link)

  const actions = document.createElement('td')
  actions.className = 'manage-actions'
  actions.append(actionButton('Edit', 'edit'), actionButton('Delete', 'delete'))

  row.append(
    photoCell,
    titleCell,
    cell(recipe.recipe_class_desc || '—'),
    cell(formatPrep(recipe.prep_time)),
    cell(formatCost(recipe.cost)),
    actions
  )
  return row
}

// Draws the table, keeping only the recipes that match the search box
function renderRecipes() {
  const filter = filterInput.value.trim().toLowerCase()
  const shown = recipes.filter((recipe) => recipe.recipe_title.toLowerCase().includes(filter))
  tableBody.replaceChildren(...shown.map(recipeRow))
  emptyNote.hidden = shown.length > 0
  countNote.textContent = `${shown.length} of ${recipes.length} recipes`
}

filterInput.addEventListener('input', renderRecipes)

// ---------- Add / edit ----------

// Opens the popup empty (Add) or filled in with a recipe (Edit)
function openForm(recipe) {
  form.reset()
  formError.hidden = true
  editingId = recipe ? recipe.recipe_id : null
  formTitle.textContent = recipe ? 'Edit recipe' : 'Add recipe'

  if (recipe) {
    form.recipe_title.value = recipe.recipe_title
    form.recipe_class_id.value = recipe.recipe_class_id ?? ''
    form.prep_time.value = recipe.prep_time ?? ''
    form.cost.value = recipe.cost ?? ''
    form.macros.value = recipe.macros ?? ''
    form.instructions.value = recipe.instructions ?? ''
    form.image_path.value = recipe.image_path ?? ''
  }
  formDialog.showModal()
}

document.getElementById('manage-add').addEventListener('click', () => openForm(null))

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  // Every field is sent; blank ones become "none" on the server
  const body = Object.fromEntries(new FormData(form))

  formError.hidden = true
  saveButton.disabled = true
  try {
    if (editingId === null) await api('/api/admin/recipes', 'POST', body)
    else await api(`/api/admin/recipes/${editingId}`, 'PATCH', body)
    formDialog.close()
    showStatus(editingId === null ? 'Recipe added.' : 'Recipe saved.')
    await loadRecipes()
  } catch (error) {
    formError.textContent = error.message
    formError.hidden = false
  } finally {
    saveButton.disabled = false
  }
})

// ---------- Delete ----------

function openDelete(recipe) {
  deletingRecipe = recipe
  deleteError.hidden = true
  const planned = recipe.planned_count
  deleteText.textContent =
    `"${recipe.recipe_title}" will be deleted for good, along with its ingredient list, likes and ratings.` +
    (planned > 0
      ? ` It is also on ${planned} meal plan ${planned === 1 ? 'entry' : 'entries'}, which will be removed.`
      : '')
  deleteDialog.showModal()
}

deleteConfirm.addEventListener('click', async () => {
  deleteConfirm.disabled = true
  try {
    await api(`/api/admin/recipes/${deletingRecipe.recipe_id}`, 'DELETE')
    deleteDialog.close()
    showStatus('Recipe deleted.')
    await loadRecipes()
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
  const recipe = recipes.find((r) => r.recipe_id === Number(button.closest('tr').dataset.recipeId))
  if (!recipe) return
  if (button.dataset.action === 'edit') openForm(recipe)
  else openDelete(recipe)
})

// Cancel buttons, and clicking the dimmed area outside a popup, close it
for (const dialog of document.querySelectorAll('dialog.manage-dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close()
  })
}

loadRecipes()

})()