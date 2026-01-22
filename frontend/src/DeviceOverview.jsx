import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import SummaryCards from './SummaryCards.jsx'
import StatusBadge from './StatusBadge.jsx'
import './DeviceOverview.css'

function DeviceOverview() {
  const navigate = useNavigate()
  const [deviceHealth, setDeviceHealth] = useState([])

  useEffect(() => {
    const fetchDeviceHealth = async () => {
      try {
        const response = await fetch('/api/devices/health')
        if (response.ok) {
          const data = await response.json()
          setDeviceHealth(data)
        }
      } catch (error) {
        console.error('Error fetching device health:', error)
      }
    }

    // Poll every 3 seconds
    const interval = setInterval(fetchDeviceHealth, 3000)
    
    // Initial fetch
    fetchDeviceHealth()

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

  // Calculate summary stats
  const totalDevices = deviceHealth.length
  const onlineCount = deviceHealth.filter(d => d.connectivityStatus === 'ONLINE').length
  const offlineCount = deviceHealth.filter(d => d.connectivityStatus === 'OFFLINE').length
  const criticalRfCount = deviceHealth.filter(d => d.rfStatus === 'CRITICAL').length

  const summaryStats = [
    { title: 'Total Devices', value: totalDevices },
    { title: 'Online', value: onlineCount, type: 'healthy' },
    { title: 'Offline', value: offlineCount, type: 'offline' },
    { title: 'Critical RF', value: criticalRfCount, type: 'critical' }
  ]

  return (
    <div>
      <h2>Device Overview</h2>
      <SummaryCards stats={summaryStats} />
      {deviceHealth.length > 0 ? (
        <div className="device-overview-card">
          <table className="device-table">
            <thead>
              <tr>
                <th>Device EUI</th>
                <th>RF Score</th>
                <th>RF Status</th>
                <th>Connectivity</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {deviceHealth.map((device) => (
                <tr 
                  key={device.devEui}
                  className={device.connectivityStatus === 'OFFLINE' ? 'device-row--offline' : ''}
                  onClick={() => navigate(`/device/${device.devEui}`)}
                >
                  <td>
                    <span className="device-eui">{device.devEui}</span>
                  </td>
                  <td>
                    <span className="device-score">{device.avgScore !== null ? device.avgScore : 'N/A'}</span>
                  </td>
                  <td>
                    <StatusBadge status={device.rfStatus} />
                  </td>
                  <td>
                    <StatusBadge status={device.connectivityStatus} />
                  </td>
                  <td>
                    <span className="last-seen">{getRelativeTime(device.lastSeen)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No device data available</p>
      )}
    </div>
  )
}

export default DeviceOverview
