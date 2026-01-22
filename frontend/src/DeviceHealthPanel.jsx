import { useState, useEffect } from 'react'
import './DeviceHealthPanel.css'

function DeviceHealthPanel() {
  const [deviceHealth, setDeviceHealth] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDeviceHealth = async () => {
      try {
        const response = await fetch('/api/devices/health')
        if (response.ok) {
          const data = await response.json()
          setDeviceHealth(data || [])
        }
      } catch (error) {
        console.error('Error fetching device health:', error)
      } finally {
        setLoading(false)
      }
    }

    // Initial fetch
    fetchDeviceHealth()

    // Poll every 3 seconds
    const interval = setInterval(fetchDeviceHealth, 3000)

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'ONLINE':
        return 'green'
      case 'WARNING':
        return 'yellow'
      case 'OFFLINE':
        return 'red'
      default:
        return 'gray'
    }
  }

  if (loading) {
    return <div>Loading device health data...</div>
  }

  if (deviceHealth.length === 0) {
    return <div>No device health data available</div>
  }

  return (
    <div className="device-health-panel">
      {deviceHealth.map((device) => (
        <div 
          key={device.dev_eui} 
          className={`device-health-card device-health-card--${getStatusColor(device.status).toLowerCase()}`}
        >
          <div className="device-health-card-header">
            <div className="device-health-card-eui">{device.dev_eui}</div>
            <div className={`device-health-card-status device-health-card-status--${getStatusColor(device.status).toLowerCase()}`}>
              {device.status}
            </div>
          </div>
          <div className="device-health-card-body">
            <div className="device-health-card-field">
              <span className="device-health-card-label">Last Uplink:</span>
              <span className="device-health-card-value">{getRelativeTime(device.last_seen)}</span>
            </div>
            <div className="device-health-card-field">
              <span className="device-health-card-label">Uplinks (24h):</span>
              <span className="device-health-card-value">{device.uplink_count_last_24h || 0}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default DeviceHealthPanel
