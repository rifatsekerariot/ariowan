import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

function GatewayDetail() {
  const { gatewayId } = useParams()
  const navigate = useNavigate()
  const [gatewayData, setGatewayData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGatewayData = async () => {
      try {
        const response = await fetch(`http://localhost:8090/api/gateways/${gatewayId}`)
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

  if (loading) {
    return <div>Loading...</div>
  }

  if (!gatewayData) {
    return (
      <div>
        <h1>Gateway not found</h1>
        <button onClick={() => navigate('/')}>Back to Overview</button>
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
      <button onClick={() => navigate('/')} style={{ marginBottom: '20px' }}>Back to Overview</button>
      <h1>Gateway Details</h1>
      <div>
        <p><strong>Gateway ID:</strong> {gatewayData.gatewayId}</p>
        <p><strong>Health Score:</strong> {gatewayData.healthScore}</p>
        <p><strong>Status:</strong> <span style={{ color: getStatusColor(gatewayData.status) }}>{gatewayData.status}</span></p>
        <p><strong>Stability Index:</strong> {gatewayData.stabilityIndex}</p>
        <p><strong>Decision:</strong> {getDecisionMessage(gatewayData.status, gatewayData.stabilityIndex)}</p>
      </div>
      {gatewayData.uplinks.length > 0 && (
        <ReactECharts option={chartOption} style={{ height: '400px', width: '100%', marginTop: '20px' }} />
      )}
    </div>
  )
}

export default GatewayDetail
