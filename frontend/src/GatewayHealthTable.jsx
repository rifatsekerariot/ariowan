import { useState, useEffect } from 'react'
import './GatewayHealthTable.css'

function GatewayHealthTable() {
  const [gatewayHealth, setGatewayHealth] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGatewayHealth = async () => {
      try {
        const response = await fetch('/api/gateways/health')
        if (response.ok) {
          const data = await response.json()
          setGatewayHealth(data || [])
        }
      } catch (error) {
        console.error('Error fetching gateway health:', error)
      } finally {
        setLoading(false)
      }
    }

    // Initial fetch
    fetchGatewayHealth()

    // Poll every 3 seconds
    const interval = setInterval(fetchGatewayHealth, 3000)

    return () => clearInterval(interval)
  }, [])

  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Never'
    const now = new Date()
    const time = new Date(timestamp)
    const diffMs = now - time
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  if (loading) {
    return <div>Loading gateway health data...</div>
  }

  if (gatewayHealth.length === 0) {
    return <div>No gateway health data available</div>
  }

  return (
    <div className="gateway-health-table-container">
      <table className="gateway-health-table">
        <thead>
          <tr>
            <th>Gateway ID</th>
            <th>Last Seen</th>
            <th>Avg SNR</th>
            <th>Avg RSSI</th>
            <th>Health Score</th>
          </tr>
        </thead>
        <tbody>
          {gatewayHealth.map((gateway) => (
            <tr key={gateway.gateway_id}>
              <td>{gateway.gateway_id}</td>
              <td>{getRelativeTime(gateway.last_seen)}</td>
              <td>{gateway.avg_snr !== null ? `${gateway.avg_snr} dB` : 'N/A'}</td>
              <td>{gateway.avg_rssi !== null ? `${gateway.avg_rssi} dBm` : 'N/A'}</td>
              <td>{gateway.health_score !== null ? gateway.health_score : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default GatewayHealthTable
