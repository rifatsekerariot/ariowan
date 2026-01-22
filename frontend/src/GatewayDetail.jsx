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
    return <div>Loading...</div>
  }

  if (!gatewayData) {
    return (
      <div>
        <button className="back-button" onClick={() => navigate('/gateways')}>Back to Overview</button>
        <h1>Gateway not found</h1>
      </div>
    )
  }

  const chartOption = {
    animation: false,
    xAxis: {
      type: 'category',
      data: gatewayData.uplinks.map(item => item.timestamp)
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: 'RSSI',
        type: 'line',
        data: gatewayData.uplinks.map(item => item.rssi)
      },
      {
        name: 'SNR',
        type: 'line',
        data: gatewayData.uplinks.map(item => item.snr)
      }
    ]
  }

  return (
    <div>
      <button className="back-button" onClick={() => navigate('/gateways')}>Back to Overview</button>
      
      <div className="gateway-detail-header">
        <div className="gateway-detail-header-info">
          <div className="gateway-detail-id">{gatewayData.gatewayId}</div>
          <div className="gateway-detail-status">
            <StatusBadge status={gatewayData.status} />
          </div>
        </div>
        <div>
          <div className="gateway-detail-score">{gatewayData.healthScore}</div>
        </div>
      </div>

      {gatewayData.uplinks.length > 0 && (
        <div className="gateway-detail-charts">
          <div className="chart-card">
            <div className="chart-card-title">RSSI & SNR Over Time</div>
            <div className="chart-container">
              <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GatewayDetail
