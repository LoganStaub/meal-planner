// Run with:  npm run db:seed-classics
// Adds 5 well-known recipes, one per meal type, based on published versions
// (source on each recipe). Ingredient amounts follow the source; the steps
// are written in our own words. cost is a rough US grocery estimate for the
// whole recipe. macros are per serving, from the source when it gives them.
//
// Safe to run more than once. How recipes are saved: recipeSeeder.js.
import { seedRecipes } from './recipeSeeder.js'

const RECIPES = [
  {
    // Source: Love and Lemons, "Best Shakshuka" (serves 4)
    // https://www.loveandlemons.com/shakshuka-recipe/
    title: 'Shakshuka',
    class: 'Breakfast',
    cost: 8.5,
    prep_time: 35,
    macros: 'Cal: 207, P: 11g, C: 7g, F: 16g',
    instructions: [
      'Warm the olive oil in a large lidded skillet over medium heat. Add the diced onion and red bell pepper and cook for 5-8 minutes, until soft.',
      'Stir in the minced garlic, cumin, paprika and cayenne and cook for about 30 seconds, until fragrant.',
      'Pour in the crushed tomatoes, add the salt and black pepper, and simmer on low for about 15 minutes, stirring often, until the sauce thickens.',
      'Make 6 wells in the sauce with a spoon and crack an egg into each one.',
      'Cover and cook for 4-8 minutes, until the whites are set and the yolks are as runny as you like.',
      'Season to taste, scatter the parsley and feta over the top, and serve with warm pita.',
    ],
    ingredients: [
      { name: 'olive oil', amount: '2', measure: 'Tablespoon', in_pantry: true },
      { name: 'onion', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Red bell pepper', amount: '1', measure: 'Each', in_pantry: false },
      { name: 'garlic clove', amount: '3', measure: 'Each', in_pantry: true },
      { name: 'Ground cumin', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'Paprika', amount: '1/2', measure: 'Teaspoon', in_pantry: true },
      { name: 'Cayenne pepper', amount: '1/8', measure: 'Teaspoon', in_pantry: true },
      { name: 'Fire-roasted crushed tomatoes', amount: '28', measure: 'Ounce', in_pantry: false },
      { name: 'salt', amount: '1/2', measure: 'Teaspoon', in_pantry: true },
      { name: 'Black Pepper', amount: '1/4', measure: 'Teaspoon', in_pantry: true },
      { name: 'eggs', amount: '6', measure: 'Each', in_pantry: true },
      { name: 'Fresh parsley', amount: '1/4', measure: 'Cup', in_pantry: false },
      { name: 'Feta cheese', amount: '1/4', measure: 'Cup', in_pantry: false },
      { name: 'Pita bread', amount: '4', measure: 'Each', in_pantry: false },
    ],
  },
  {
    // Source: Jessica Gavin, "Chicken Caesar Salad" (serves 4)
    // https://www.jessicagavin.com/chicken-caesar-salad/
    title: 'Chicken Caesar Salad',
    class: 'Lunch',
    cost: 15,
    prep_time: 50,
    macros: 'Cal: 891, P: 41g, C: 66g, F: 52g',
    instructions: [
      'Heat the oven to 375°F. Toss the bread cubes with 1 tbsp olive oil, 1/4 tsp salt, 1/8 tsp pepper and the Italian seasoning, spread them on a baking sheet and bake for 12-14 minutes, stirring halfway, until golden and crunchy.',
      'Pound the chicken breasts to an even 1/2 inch thick and season both sides with 3/4 tsp salt and 1/2 tsp pepper.',
      'Heat 1 tbsp olive oil in a skillet over medium heat and cook the chicken until golden on both sides and 165°F in the center. Rest it for 10 minutes, then slice against the grain.',
      'For the dressing, mash the anchovies, garlic and 1/4 tsp salt into a paste.',
      'Whisk in the mayonnaise, Dijon, 2 tbsp lemon juice, 1 tsp lemon zest, 1/2 tsp salt and 1/4 tsp pepper. Slowly whisk in 1/2 cup olive oil until thick, then stir in 3 tbsp parmesan.',
      'Toss the romaine with about 1/4 cup of the dressing, top with the chicken, croutons and the rest of the parmesan, and serve the extra dressing on the side.',
    ],
    ingredients: [
      { name: 'Chicken Breast', amount: '1', measure: 'Pound', in_pantry: false },
      { name: 'salt', amount: '1 3/4', measure: 'Teaspoon', in_pantry: true },
      { name: 'Black Pepper', amount: '7/8', measure: 'Teaspoon', in_pantry: true },
      { name: 'olive oil', amount: '10', measure: 'Tablespoon', in_pantry: true },
      { name: 'French bread', amount: '2', measure: 'Cup', in_pantry: false },
      { name: 'Italian seasoning', amount: '1/8', measure: 'Teaspoon', in_pantry: true },
      { name: 'Romaine lettuce', amount: '8', measure: 'Cup', in_pantry: false },
      { name: 'Anchovies', amount: '6', measure: 'Each', in_pantry: false },
      { name: 'garlic clove', amount: '1', measure: 'Each', in_pantry: true },
      { name: 'Mayonnaise', amount: '1/4', measure: 'Cup', in_pantry: true },
      { name: 'Dijon mustard', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'Lemon', amount: '1', measure: 'Each', in_pantry: false },
      { name: 'parmesan cheese', amount: '1/4', measure: 'Cup', in_pantry: true },
    ],
  },
  {
    // Source: RecipeTin Eats, "Aglio e Olio (Garlic Spaghetti)" (serves 4-5;
    // macros are for 5 servings)
    // https://www.recipetineats.com/aglio-e-olio-garlic-spaghetti/
    title: 'Spaghetti Aglio e Olio',
    class: 'Dinner',
    cost: 6,
    prep_time: 18,
    macros: 'Cal: 564, P: 13g, C: 75g, F: 23g',
    instructions: [
      'Bring a large pot of water to a boil with 2 tsp salt and cook the spaghetti for 1 minute less than the package says.',
      'Before draining, scoop out 1 cup of the cooking water, then drain the pasta.',
      'While the pasta cooks, warm the olive oil in a large skillet over medium heat. Add the sliced garlic and cook for 2-3 minutes until light golden; don\'t let it brown or it turns bitter. Add the chili flakes for a few seconds.',
      'Add the spaghetti, 1/2 cup of the reserved water and the remaining 1 tsp salt. Toss over medium-high heat for 1-1.5 minutes, until the sauce clings to the pasta, adding a splash more water if it looks dry.',
      'Toss in the parsley and serve right away with grated parmesan.',
    ],
    ingredients: [
      { name: 'Spaghetti', amount: '1', measure: 'Pound', in_pantry: true },
      { name: 'salt', amount: '3', measure: 'Teaspoon', in_pantry: true },
      { name: 'olive oil', amount: '1/2', measure: 'Cup', in_pantry: true },
      { name: 'garlic clove', amount: '6', measure: 'Each', in_pantry: true },
      { name: 'Red pepper flakes', amount: '1/2', measure: 'Teaspoon', in_pantry: true },
      { name: 'Fresh parsley', amount: '1/3', measure: 'Cup', in_pantry: false },
      { name: 'parmesan cheese', amount: '1/4', measure: 'Cup', in_pantry: true },
    ],
  },
  {
    // Source: Lively Table, "Classic Guacamole" (makes about 1 cup from 1
    // avocado; tripled here to serve 4). It gives no nutrition, so macros are
    // estimated from the ingredients.
    // https://livelytable.com/classic-guacamole/
    title: 'Classic Guacamole',
    class: 'Snack',
    cost: 5.5,
    prep_time: 10,
    macros: 'Cal: 250, P: 3g, C: 14g, F: 22g',
    instructions: [
      'Halve the avocados, remove the pits and scoop the flesh into a bowl.',
      'Squeeze the lime juice over the avocado and mash with a fork until it\'s as smooth or chunky as you like.',
      'Gently fold in the red onion, tomato, salt and garlic powder, plus the cilantro and jalapeño if using.',
      'Taste and add more salt or lime if needed. Serve right away with tortilla chips, or press plastic wrap onto the surface and refrigerate for up to 4 hours.',
    ],
    ingredients: [
      { name: 'Avocado', amount: '3', measure: 'Each', in_pantry: false },
      { name: 'Lime', amount: '1 1/2', measure: 'Each', in_pantry: false },
      { name: 'Red onion', amount: '6', measure: 'Tablespoon', in_pantry: true },
      { name: 'tomatoes', amount: '6', measure: 'Tablespoon', in_pantry: true },
      { name: 'salt', amount: '1/2', measure: 'Teaspoon', in_pantry: true },
      { name: 'Garlic powder', amount: '1/4', measure: 'Teaspoon', in_pantry: true },
      { name: 'Cilantro', amount: '2', measure: 'Tablespoon', in_pantry: false },
      { name: 'Jalapeño', amount: '1', measure: 'Each', in_pantry: false },
    ],
  },
  {
    // Source: the original Nestlé Toll House recipe (makes about 5 dozen),
    // as printed by The Daily Meal. It gives no nutrition, so macros are
    // estimated per cookie from the ingredients.
    // https://www.thedailymeal.com/recipes/original-nestl-toll-house-chocolate-chip-cookies-recipe-0
    title: 'Original Toll House Chocolate Chip Cookies',
    class: 'Dessert',
    cost: 9,
    prep_time: 30,
    macros: 'Cal: 110, P: 1g, C: 13g, F: 6g',
    instructions: [
      'Heat the oven to 375°F.',
      'Whisk the flour, baking soda and salt together in a small bowl.',
      'In a large bowl, beat the softened butter, granulated sugar, brown sugar and vanilla until creamy.',
      'Beat in the eggs one at a time, then gradually mix in the flour mixture.',
      'Stir in the chocolate chips and the walnuts, if using.',
      'Drop rounded tablespoons of dough onto ungreased baking sheets and bake for 9-11 minutes, until golden brown.',
      'Let the cookies cool on the sheets for 2 minutes, then move them to wire racks to cool completely.',
    ],
    ingredients: [
      { name: 'flour', amount: '2 1/4', measure: 'Cup', in_pantry: true },
      { name: 'Baking soda', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'salt', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'Butter', amount: '1', measure: 'Cup', in_pantry: true },
      { name: 'Granulated sugar', amount: '3/4', measure: 'Cup', in_pantry: true },
      { name: 'Brown sugar', amount: '3/4', measure: 'Cup', in_pantry: true },
      { name: 'Vanilla extract', amount: '1', measure: 'Teaspoon', in_pantry: true },
      { name: 'eggs', amount: '2', measure: 'Each', in_pantry: true },
      { name: 'Semi-sweet chocolate chips', amount: '12', measure: 'Ounce', in_pantry: false },
      { name: 'Chopped walnuts', amount: '1', measure: 'Cup', in_pantry: false },
    ],
  },
]

await seedRecipes(RECIPES)
