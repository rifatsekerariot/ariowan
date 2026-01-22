import { Link } from 'react-router-dom'

function Navigation() {
  return (
    <nav style={{ 
      borderBottom: '1px solid #ddd', 
      padding: '10px 20px',
      marginBottom: '20px',
      backgroundColor: '#f5f5f5'
    }}>
      <Link 
        to="/gateways" 
        style={{ 
          marginRight: '20px', 
          textDecoration: 'none', 
          color: '#333',
          fontWeight: 'bold'
        }}
      >
        Gateways
      </Link>
      <Link 
        to="/devices" 
        style={{ 
          textDecoration: 'none', 
          color: '#333',
          fontWeight: 'bold'
        }}
      >
        Devices
      </Link>
    </nav>
  )
}

export default Navigation
