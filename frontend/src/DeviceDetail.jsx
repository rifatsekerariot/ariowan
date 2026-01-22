import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import StatusBadge from './StatusBadge.jsx'
import './DeviceDetail.css'

function DeviceDetail() {
  const { devEui } = useParams()
  const navigate = useNavigate()
  const [deviceData, setDeviceData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDeviceData = async () => {
      try {
        const response = await fetch(`/api/devices/${devEui}`)
        if (response.ok) {
          const data = await response.json()
          setDeviceData(data)
        } else if (response.status === 404) {
          setDeviceData(null)
        }
      } catch (error) {
        console.error('Error fetching device data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDeviceData()
  }, [devEui])


  if (loading) {
    return <div>Loading...</div>
  }

  if (!deviceData) {
    return (
      <div>
        <button className="back-button" onClick={() => navigate('/devices')}>Back to Device Overview</button>
        <h1>Device not found</h1>
      </div>
    )
  }

  // Prepare data for charts (last 20 uplinks)
  const lastUplinks = deviceData.uplinks.slice(-20)

  // Line chart: RSSI & SNR vs time
  const lineChartOption = {
    animation: false,
    xAxis: {
      type: 'category',
      data: lastUplinks.map(item => item.timestamp)
    },
    yAxis: {
      type: 'value'
    },
    series: [
      {
        name: 'RSSI',
        type: 'line',
        data: lastUplinks.map(item => item.rssi)
      },
      {
        name: 'SNR',
        type: 'line',
        data: lastUplinks.map(item => item.snr)
      }
    ]
  }

  // Bar chart: Uplink count per gateway (grouped by gatewayId)
  const gatewayCounts = {}
  lastUplinks.forEach(uplink => {
    const gatewayId = uplink.gatewayId
    gatewayCounts[gatewayId] = (gatewayCounts[gatewayId] || 0) + 1
  })

  // Sort gateways by count (descending) to show dependency
  const sortedGateways = Object.entries(gatewayCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([gatewayId, count]) => ({ gatewayId, count }))

  const barChartOption = {
    animation: false,
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const param = params[0]
        return `${param.name}<br/>Uplinks: ${param.value}`
      }
    },
    xAxis: {
      type: 'category',
      data: sortedGateways.map(g => g.gatewayId),
      name: 'Gateway ID'
    },
    yAxis: {
      type: 'value',
      name: 'Uplink Count'
    },
    series: [
      {
        name: 'Uplink Count',
        type: 'bar',
        data: sortedGateways.map(g => g.count)
      }
    ]
  }

  return (
    <div>
      <button className="back-button" onClick={() => navigate('/devices')}>Back to Device Overview</button>
      
      <div className="device-detail-header">
        <div className="device-detail-header-info">
          <div className="device-detail-eui">{deviceData.devEui}</div>
          <div className="device-detail-badges">
            <StatusBadge status={deviceData.rfStatus} />
            <StatusBadge status={deviceData.connectivityStatus} />
          </div>
        </div>
      </div>

      {lastUplinks.length > 0 && (
        <div className="device-detail-charts">
          <div className="chart-card">
            <div className="chart-card-title">RSSI & SNR Over Time</div>
            <div className="chart-card-info">Signal strength and signal-to-noise ratio trends from recent uplinks.</div>
            <div className="chart-container">
              <ReactECharts option={lineChartOption} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-card-title">Gateway Distribution</div>
            <div className="chart-card-info">Uplink count per gateway showing device dependency across network.</div>
            <div className="chart-container">
              <ReactECharts option={barChartOption} style={{ height: '100%', width: '100%' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeviceDetail
