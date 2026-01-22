import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import GatewayDetail from './GatewayDetail.jsx'
import DeviceOverview from './DeviceOverview.jsx'
import DeviceDetail from './DeviceDetail.jsx'
import Navigation from './Navigation.jsx'
import StatusBadge from './StatusBadge.jsx'
import './App.css'
import './GatewayOverview.css'

function GatewayOverview() {
  const navigate = useNavigate()
  const [uplinkData, setUplinkData] = useState(null)
  const [isWaiting, setIsWaiting] = useState(true)
  const [chartData, setChartData] = useState([])
  const [lastThreeScores, setLastThreeScores] = useState([])
  const [gatewayHealth, setGatewayHealth] = useState([])

  const calculateLinkHealthScore = (snr, rssi) => {
    if (snr >= 7 && rssi >= -90) {
      return 100
    } else if (snr >= 3 && snr < 7) {
      return 70
    } else {
      return 40
    }
  }

  useEffect(() => {
    const fetchUplink = async () => {
      try {
        const response = await fetch('/api/last-uplink')
        
        if (response.status === 200) {
          const data = await response.json()
          setUplinkData(data)
          setIsWaiting(false)
          
          // Calculate score for this uplink
          const score = calculateLinkHealthScore(data.snr, data.rssi)
          
          // Track last 3 scores
          setLastThreeScores(prev => {
            const newScores = [...prev, score]
            return newScores.slice(-3)
          })
          
          // Add to chart data and keep last 50 points
          setChartData(prev => {
            const newData = [...prev, {
              timestamp: data.timestamp,
              rssi: data.rssi,
              snr: data.snr
            }]
            return newData.slice(-50)
          })
        } else if (response.status === 204) {
          setUplinkData(null)
          setIsWaiting(true)
        }
      } catch (error) {
        console.error('Error fetching uplink:', error)
      }
    }

    // Poll every 2 seconds
    const interval = setInterval(fetchUplink, 2000)
    
    // Initial fetch
    fetchUplink()

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchGatewayHealth = async () => {
      try {
        const response = await fetch('/api/gateways/health')
        if (response.ok) {
          const data = await response.json()
          setGatewayHealth(data)
        }
      } catch (error) {
        console.error('Error fetching gateway health:', error)
      }
    }

    // Poll every 3 seconds
    const interval = setInterval(fetchGatewayHealth, 3000)
    
    // Initial fetch
    fetchGatewayHealth()

    return () => clearInterval(interval)
  }, [])

  const linkHealthScore = uplinkData 
    ? calculateLinkHealthScore(uplinkData.snr, uplinkData.rssi)
    : null

  // Calculate link status based on last 3 scores
  const linkStatus = lastThreeScores.length === 3 && lastThreeScores.every(score => score < 50)
    ? 'LINK DEGRADED'
    : 'LINK OK'

  const chartOption = {
    animation: false,
    xAxis: {
      type: 'category',
      data: chartData.map(item => item.timestamp)
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: 'RSSI',
        type: 'line',
        data: chartData.map(item => item.rssi)
      },
      {
        name: 'SNR',
        type: 'line',
        data: chartData.map(item => item.snr)
      }
    ]
  }


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

  const getDecisionMessage = (status, stabilityIndex) => {
    if (status === 'HEALTHY' && stabilityIndex === 'STABLE') {
      return 'Gateway operating within normal RF conditions.'
    }
    if (status === 'CRITICAL' || stabilityIndex === 'VERY_UNSTABLE') {
      return 'Gateway RF quality is critical. Immediate inspection required.'
    }
    if (status === 'DEGRADED' || stabilityIndex === 'UNSTABLE') {
      return 'Gateway shows RF degradation. Antenna or interference check recommended.'
    }
    return 'Gateway operating within normal RF conditions.'
  }

  return (
    <div>
      <h2>Gateway Overview</h2>
      {gatewayHealth.length > 0 ? (
        <div className="gateway-overview-card">
          <table className="gateway-table">
            <thead>
              <tr>
                <th>Gateway ID</th>
                <th>Avg RF Score</th>
                <th>Status</th>
                <th>Stability</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {gatewayHealth.map((gateway) => (
                <tr 
                  key={gateway.gatewayId}
                  onClick={() => navigate(`/gateway/${gateway.gatewayId}`)}
                >
                  <td>
                    <span className="gateway-id">{gateway.gatewayId}</span>
                  </td>
                  <td>
                    <span className="gateway-score">{gateway.avgScore}</span>
                  </td>
                  <td>
                    <StatusBadge status={gateway.status} />
                  </td>
                  <td>
                    <span className="stability-text">{gateway.stabilityIndex}</span>
                  </td>
                  <td>
                    <span className="last-seen">{getRelativeTime(gateway.lastSeen)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No gateway data available</p>
      )}

      {isWaiting ? (
        <p>Waiting for uplink...</p>
      ) : (
        <div>
          <p>Device EUI: {uplinkData?.devEui}</p>
          <p>Gateway ID: {uplinkData?.gatewayId}</p>
          <p>RSSI: {uplinkData?.rssi}</p>
          <p>SNR: {uplinkData?.snr}</p>
          <p>Timestamp: {uplinkData?.timestamp}</p>
        </div>
      )}
      {linkHealthScore !== null && (
        <div>
          <h2>Link Health Score: {linkHealthScore}</h2>
        </div>
      )}
      {lastThreeScores.length > 0 && (
        <div>
          <h2>Status: {linkStatus}</h2>
        </div>
      )}
      {chartData.length > 0 && (
        <ReactECharts option={chartOption} style={{ height: '400px', width: '100%' }} />
      )}
    </div>
  )
}

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>RF Analytics Platform</h1>
      </header>
      <Navigation />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<GatewayOverview />} />
          <Route path="/gateways" element={<GatewayOverview />} />
          <Route path="/gateway/:gatewayId" element={<GatewayDetail />} />
          <Route path="/devices" element={<DeviceOverview />} />
          <Route path="/device/:devEui" element={<DeviceDetail />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
