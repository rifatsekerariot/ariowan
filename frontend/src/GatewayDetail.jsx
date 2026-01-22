import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import StatusBadge from './StatusBadge.jsx'
import './GatewayDetail.css'

function GatewayDetail() {
  const { gatewayId } = useParams()
  const navigate = useNavigate()
  const [gatewayData, setGatewayData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGatewayData = async () => {
      try {
        const response = await fetch(`/api/gateways/${gatewayId}`)
        if (response.ok) {
          const data = await response.json()
          setGatewayData(data)
        } else if (response.status === 404) {
          setGatewayData(null)
        }
      } catch (error) {
        console.error('Error fetching gateway data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchGatewayData()
  }, [gatewayId])


  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="page-section">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!gatewayData) {
    return (
      <div className="page-wrapper">
        <div className="page-section">
          <button className="back-button" onClick={() => navigate('/gateways')}>Back to Overview</button>
          <h1>Gateway not found</h1>
        </div>
      </div>
    )
  }

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
      data: gatewayData.uplinks.map(item => item.timestamp),
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
        data: gatewayData.uplinks.map(item => item.rssi),
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
        data: gatewayData.uplinks.map(item => item.snr),
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

  return (
    <div className="page-wrapper">
      <div className="page-section">
        <button className="back-button" onClick={() => navigate('/gateways')}>Back to Overview</button>
      </div>
      
      <div className="page-section">
        <div className="gateway-detail-header">
          <div className="gateway-detail-header-info">
            <div className="gateway-detail-id">{gatewayData.gatewayId}</div>
            <div className="gateway-detail-status">
              <StatusBadge status={gatewayData.status} />
            </div>
          </div>
          <div className="health-score-display">
            <div className="health-score-label">Health Score</div>
            <div className={`health-score-value health-score--${(gatewayData.status || 'UNKNOWN').toLowerCase()}`}>
              {gatewayData.healthScore}
            </div>
          </div>
        </div>
      </div>

      {gatewayData.uplinks.length > 0 && (
        <div className="page-section">
          <div className="gateway-detail-charts">
            <div className="chart-card">
              <div className="chart-card-title">RSSI & SNR Over Time</div>
              <div className="chart-container">
                <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GatewayDetail
