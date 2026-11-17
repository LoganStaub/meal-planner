// Turns a recipe from getRecipe() (routes/recipes.js) into what the recipe
// page shows (front/views/recipe.ejs): readable times, amounts, macros,
// pantry badges and a list of steps.

// 35 -> "35 min", 90 -> "1 hr 30 min"
function formatTime(minutes) {
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  const hours = Math.floor(minutes / 60)
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

// recipes.macros is one line of free text in two formats so far:
//   "Cal: 560, P: 30g, C: 41g, F: 31g"                      (live data)
//   "Per serving (serves 4, vegan): 520 kcal | Protein 34g | Carbs 48g | Fat 20g"
//                                     (scripts/seedRecipes.js and the AI assistant)
function parseMacros(text = '') {
  const find = (pattern) => {
    const match = pattern.exec(text)
    const value = match?.slice(1).find((group) => group !== undefined)
    return value === undefined ? null : Math.round(Number(value))
  }
  const serves = /\(serves\s+(\d+)([^)]*)\)/i.exec(text)
  return {
    servings: serves ? Number(serves[1]) : null,
    // Anything else in the brackets, such as "vegan"
    tags: serves ? serves[2].split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    calories: find(/(\d+)\s*kcal|\bcal(?:ories)?\s*:?\s*(\d+)/i),
    protein: find(/\b(?:protein|p)\s*:?\s*(\d+(?:\.\d+)?)\s*g/i),
    carbs: find(/\b(?:carbs|c)\s*:?\s*(\d+(?:\.\d+)?)\s*g/i),
    fat: find(/\b(?:fat|f)\s*:?\s*(\d+(?:\.\d+)?)\s*g/i),
  }
}

// Short units read better in a list: "2 tbsp", "1/2 cup"
const UNITS = { Cup: 'cup', Tablespoon: 'tbsp', Teaspoon: 'tsp', Gram: 'g', Ounce: 'oz', Pound: 'lb' }

// "Each" is for countable things (2 eggs), so only the number is shown
function formatAmount(item) {
  const unit = item.measurement_desc === 'Each' ? '' : UNITS[item.measurement_desc] ?? item.measurement_desc ?? ''
  return [item.amount, unit].filter(Boolean).join(' ')
}

// Same meaning as the Pantry page: 0 plenty, 1 running low, 2 or missing = none
function pantryStatus(pantryAmountId) {
  if (pantryAmountId === 0) return { className: 'have', label: 'In pantry' }
  if (pantryAmountId === 1) return { className: 'low', label: 'Running low' }
  return { className: 'buy', label: 'To buy' }
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

export function describeRecipe(recipe) {
  const macros = parseMacros(recipe.macros ?? '')

  // Time, meal type, servings, tags like "Vegan", cost
  const facts = []
  if (recipe.prep_time) facts.push(formatTime(Math.round(recipe.prep_time)))
  if (macros.servings) facts.push(`Serves ${macros.servings}`)
  for (const tag of macros.tags) facts.push(capitalize(tag))
  if (typeof recipe.cost === 'number') {
    const perServing = macros.servings > 1 ? ` ($${(recipe.cost / macros.servings).toFixed(2)} a serving)` : ''
    facts.push(`About $${recipe.cost.toFixed(2)}${perServing}`)
  }

  const macroTiles = [
    [macros.calories, '', 'Calories'],
    [macros.protein, 'g', 'Protein'],
    [macros.carbs, 'g', 'Carbs'],
    [macros.fat, 'g', 'Fat'],
  ]
    .filter(([value]) => value !== null)
    .map(([value, unit, label]) => ({ value: `${value}${unit}`, label }))

  const ingredients = recipe.recipe_ingredients.map((item) => ({
    amount: formatAmount(item),
    name: item.ingredient_name,
    pantry: pantryStatus(item.pantry_amount_id),
  }))
  const toBuy = ingredients.filter((item) => item.pantry.className === 'buy').length

  // Steps: one per line in recipes.instructions, saved as "1. Do this"
  const steps = (recipe.instructions ?? '').split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s+/, ''))
    .filter(Boolean)

  return {
    recipe_id: recipe.recipe_id,
    title: recipe.recipe_title,
    mealType: recipe.recipe_class_desc,
    liked: Boolean(recipe.liked),
    addedBy: recipe.added_by,
    facts,
    macroTiles,
    // The macros text when it couldn't be read as numbers
    macrosText: macroTiles.length === 0 ? recipe.macros : null,
    ingredients,
    pantrySummary: ingredients.length === 0 ? null
      : toBuy === 0 ? 'You have everything'
        : `${ingredients.length - toBuy} in pantry · ${toBuy} to buy`,
    steps,
  }
}
