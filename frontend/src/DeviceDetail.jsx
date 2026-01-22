import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'

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

  if (loading) {
    return <div>Loading...</div>
  }

  if (!deviceData) {
    return (
      <div>
        <h1>Device not found</h1>
        <button onClick={() => navigate('/devices')}>Back to Device Overview</button>
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
    title: {
      text: 'Gateway Dependency',
      left: 'center'
    },
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
      <button onClick={() => navigate('/devices')} style={{ marginBottom: '20px' }}>Back to Device Overview</button>
      <h1>Device Details</h1>
      <div>
        <p><strong>Device EUI:</strong> {deviceData.devEui}</p>
        <p><strong>RF Health Score:</strong> {deviceData.avgScore}</p>
        <p><strong>RF Status:</strong> <span style={{ color: getRfStatusColor(deviceData.rfStatus) }}>{deviceData.rfStatus}</span></p>
        <p><strong>Connectivity Status:</strong> <span style={{ color: getConnectivityColor(deviceData.connectivityStatus) }}>{deviceData.connectivityStatus}</span></p>
        <p><strong>Last Seen:</strong> {deviceData.lastSeen}</p>
      </div>
      {lastUplinks.length > 0 && (
        <>
          <div style={{ marginTop: '20px' }}>
            <h3>RSSI & SNR Over Time</h3>
            <ReactECharts option={lineChartOption} style={{ height: '400px', width: '100%' }} />
          </div>
          <div style={{ marginTop: '20px' }}>
            <h3>Uplink Count per Gateway</h3>
            <ReactECharts option={barChartOption} style={{ height: '400px', width: '100%' }} />
          </div>
        </>
      )}
    </div>
  )
}

export default DeviceDetail
