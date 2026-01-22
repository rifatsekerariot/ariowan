import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

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

  const getRfStatusColor = (status) => {
    if (status === 'HEALTHY') return 'green'
    if (status === 'DEGRADED') return 'yellow'
    if (status === 'CRITICAL') return 'red'
    return 'black'
  }

  const getConnectivityColor = (status) => {
    if (status === 'OFFLINE') return 'gray'
    return 'black'
  }

  return (
    <div>
      <h1>RF Analytics UI</h1>
      
      <div>
        <h2>Device Overview</h2>
        {deviceHealth.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Device EUI</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Avg RF Score</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>RF Status</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Connectivity Status</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {deviceHealth.map((device) => (
                <tr 
                  key={device.devEui} 
                  style={{ borderBottom: '1px solid #ddd', cursor: 'pointer' }}
                  onClick={() => navigate(`/device/${device.devEui}`)}
                >
                  <td style={{ padding: '10px' }}>{device.devEui}</td>
                  <td style={{ padding: '10px' }}>{device.avgScore !== null ? device.avgScore : 'N/A'}</td>
                  <td style={{ padding: '10px', color: getRfStatusColor(device.rfStatus) }}>
                    {device.rfStatus}
                  </td>
                  <td style={{ padding: '10px', color: getConnectivityColor(device.connectivityStatus) }}>
                    {device.connectivityStatus}
                  </td>
                  <td style={{ padding: '10px' }}>{device.lastSeen || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No device data available</p>
        )}
      </div>
    </div>
  )
}

export default DeviceOverview
