import { Link } from 'react-router-dom'
import './Navigation.css'

function Navigation() {
  return (
    <nav className="top-navigation">
      <div className="nav-wrapper">
        <Link to="/gateways" className="nav-link">Gateways</Link>
        <Link to="/devices" className="nav-link">Devices</Link>
      </div>
    </nav>
  )
}

export default Navigation
