import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import GatewayDetail from './GatewayDetail.jsx'
import DeviceOverview from './DeviceOverview.jsx'

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
        const response = await fetch('http://localhost:8090/api/last-uplink')
        
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
        const response = await fetch('http://localhost:8090/api/gateways/health')
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

  const getStatusColor = (status) => {
    if (status === 'HEALTHY') return 'green'
    if (status === 'DEGRADED') return 'yellow'
    if (status === 'CRITICAL') return 'red'
    return 'black'
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
      <h1>RF Analytics UI</h1>
      
      <div>
        <h2>Gateway Overview</h2>
        {gatewayHealth.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '20px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Gateway ID</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Avg Score</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Last Seen</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #333' }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {gatewayHealth.map((gateway) => (
                <tr 
                  key={gateway.gatewayId} 
                  style={{ borderBottom: '1px solid #ddd', cursor: 'pointer' }}
                  onClick={() => navigate(`/gateway/${gateway.gatewayId}`)}
                >
                  <td style={{ padding: '10px' }}>{gateway.gatewayId}</td>
                  <td style={{ padding: '10px' }}>{gateway.avgScore}</td>
                  <td style={{ padding: '10px', color: getStatusColor(gateway.status) }}>
                    {gateway.status}
                  </td>
                  <td style={{ padding: '10px' }}>{gateway.lastSeen}</td>
                  <td style={{ padding: '10px' }}>{getDecisionMessage(gateway.status, gateway.stabilityIndex)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No gateway data available</p>
        )}
      </div>

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
    <Routes>
      <Route path="/" element={<GatewayOverview />} />
      <Route path="/gateway/:gatewayId" element={<GatewayDetail />} />
      <Route path="/devices" element={<DeviceOverview />} />
    </Routes>
  )
}

export default App
