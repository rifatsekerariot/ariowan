import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import GatewayDetail from './GatewayDetail.jsx'
import DeviceOverview from './DeviceOverview.jsx'
import DeviceDetail from './DeviceDetail.jsx'
import Navigation from './Navigation.jsx'
import StatusBadge from './StatusBadge.jsx'
import DashboardKPIs from './DashboardKPIs.jsx'
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
          // Transform health data to match expected format
          const transformedData = data.map(gateway => {
            // Determine status from health_score
            let status = 'UNKNOWN'
            if (gateway.health_score === 100) {
              status = 'HEALTHY'
            } else if (gateway.health_score === 70) {
              status = 'DEGRADED'
            } else if (gateway.health_score === 40) {
              status = 'CRITICAL'
            }
            
            // Calculate avgScore from avg_snr and avg_rssi (simple RF score formula)
            let avgScore = null
            if (gateway.avg_snr !== null && gateway.avg_rssi !== null) {
              avgScore = Math.round((gateway.avg_snr * 2) + (gateway.avg_rssi / 10))
            }
            
            return {
              gatewayId: gateway.gateway_id,
              status: status,
              avgScore: avgScore,
              stabilityIndex: 'N/A', // Not available in health endpoint
              lastSeen: gateway.last_seen,
            }
          })
          setGatewayHealth(transformedData)
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
    grid: {
      left: '60px',
      right: '40px',
      top: '50px',
      bottom: '60px',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: chartData.map(item => item.timestamp),
      name: 'Time',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        fontSize: 12,
        color: '#94a3b8'
      },
      axisLabel: {
        fontSize: 11,
        color: '#94a3b8',
        rotate: 0
      },
      axisLine: {
        lineStyle: {
          color: '#334155'
        }
      },
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: 'Value',
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: {
        fontSize: 12,
        color: '#94a3b8'
      },
      axisLabel: {
        fontSize: 11,
        color: '#94a3b8'
      },
      axisLine: {
        lineStyle: {
          color: '#334155'
        }
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: '#334155',
          type: 'dashed',
          opacity: 0.3
        }
      }
    },
    series: [
      {
        name: 'RSSI',
        type: 'line',
        data: chartData.map(item => item.rssi),
        smooth: false,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 2
        }
      },
      {
        name: 'SNR',
        type: 'line',
        data: chartData.map(item => item.snr),
        smooth: false,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 2
        }
      }
    ],
    legend: {
      show: true,
      top: 10,
      textStyle: {
        fontSize: 12,
        color: '#f1f5f9'
      },
      itemGap: 20
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: {
        color: '#f1f5f9',
        fontSize: 12
      },
      axisPointer: {
        lineStyle: {
          color: '#94a3b8',
          opacity: 0.5
        }
      }
    }
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
    <div className="page-wrapper">
      <div className="page-section">
        <h2>Gateway Overview</h2>
        <DashboardKPIs />
      </div>
      <div className="page-section">
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
                {gatewayHealth.map((gateway) => {
                  const status = gateway.status || 'UNKNOWN'
                  return (
                  <tr 
                    key={gateway.gatewayId}
                    className={`gateway-row--${status.toLowerCase()}`}
                    onClick={() => navigate(`/gateway/${gateway.gatewayId}`)}
                  >
                    <td>
                      <span className="gateway-id">{gateway.gatewayId}</span>
                    </td>
                    <td>
                      <div className="gateway-score">
                        <span className={`gateway-score-value gateway-score--${status.toLowerCase()}`}>
                          {gateway.avgScore}
                        </span>
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td>
                      <span className="stability-text">{gateway.stabilityIndex}</span>
                    </td>
                    <td>
                      <span className="last-seen">{getRelativeTime(gateway.lastSeen)}</span>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No gateway data available</p>
        )}
      </div>

      {isWaiting ? (
        <div className="page-section">
          <p>Waiting for uplink...</p>
        </div>
      ) : (
        <div className="page-section">
          <p>Device EUI: {uplinkData?.devEui}</p>
          <p>Gateway ID: {uplinkData?.gatewayId}</p>
          <p>RSSI: {uplinkData?.rssi}</p>
          <p>SNR: {uplinkData?.snr}</p>
          <p>Timestamp: {uplinkData?.timestamp}</p>
        </div>
      )}
      {linkHealthScore !== null && (
        <div className="page-section">
          <div className="health-score-display">
            <div className="health-score-label">Link Health Score</div>
            <div className={`health-score-value health-score--${linkHealthScore >= 80 ? 'healthy' : linkHealthScore >= 50 ? 'degraded' : 'critical'}`}>
              {linkHealthScore}
            </div>
          </div>
        </div>
      )}
      {lastThreeScores.length > 0 && (
        <div className="page-section">
          <h2>Status: {linkStatus}</h2>
        </div>
      )}
      {chartData.length > 0 && (
        <div className="page-section">
          <ReactECharts option={chartOption} style={{ height: '400px', width: '100%' }} />
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-wrapper">
          <h1>RF Analytics Platform</h1>
        </div>
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
