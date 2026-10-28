// Placeholder page — data functions to use: getRecipeWithIngredients() from api/recipes.js
import { useParams } from 'react-router-dom'

export default function RecipeDetail() {
  const { recipeId } = useParams()
  return (
    <section>
      <h1>Recipe #{recipeId}</h1>
      <p>Coming soon.</p>
    </section>
  )
}
