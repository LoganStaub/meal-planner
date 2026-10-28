import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <section>
      <h1>Meal Planner</h1>
      <p>Plan your week, find recipes, and keep track of what you're cooking.</p>
      <div className="actions">
        <Link to="/recipes" className="button">Browse recipes</Link>
        <Link to="/meal-plan" className="button secondary">View meal plan</Link>
      </div>
    </section>
  )
}
