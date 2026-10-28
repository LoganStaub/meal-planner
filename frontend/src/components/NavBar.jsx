import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/add-recipe', label: 'Add Recipe' },
  { to: '/meal-plan', label: 'Meal Plan' },
  { to: '/profile', label: 'Profile' },
]

export default function NavBar() {
  return (
    <nav className="navbar">
      <span className="brand">Meal Planner</span>
      <ul>
        {links.map(({ to, label }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'}>{label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
