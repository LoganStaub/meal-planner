const list = document.getElementById('item-list')
const countEl = document.getElementById('items-left-text')
const form = document.getElementById('add-form')
const input = document.getElementById('add-input')

function updateCount() {
  const left = list.querySelectorAll('.shop-item:not(.done)').length
  countEl.textContent = `${left} ${left === 1 ? 'item' : 'items'} left`
}

list.addEventListener('change', (event) => {
  if (!event.target.classList.contains('shop-check')) return
  event.target.closest('.shop-item').classList.toggle('done', event.target.checked)
  updateCount()
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