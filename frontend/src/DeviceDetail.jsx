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
    return (
      <div className="page-wrapper">
        <div className="page-section">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!deviceData) {
    return (
      <div className="page-wrapper">
        <div className="page-section">
          <button className="back-button" onClick={() => navigate('/devices')}>Back to Device Overview</button>
          <h1>Device not found</h1>
        </div>
      </div>
    )
  }

  // Prepare data for charts (last 20 uplinks)
  const lastUplinks = deviceData.uplinks.slice(-20)

  // Line chart: RSSI & SNR vs time
  const lineChartOption = {
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
      data: lastUplinks.map(item => item.timestamp),
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
        data: lastUplinks.map(item => item.rssi),
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
        data: lastUplinks.map(item => item.snr),
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
    grid: {
      left: '60px',
      right: '40px',
      top: '50px',
      bottom: '60px',
      containLabel: false
    },
    xAxis: {
      type: 'category',
      data: sortedGateways.map(g => g.gatewayId),
      name: 'Gateway ID',
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
      name: 'Uplink Count',
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
        name: 'Uplink Count',
        type: 'bar',
        data: sortedGateways.map(g => g.count),
        itemStyle: {
          borderRadius: [4, 4, 0, 0]
        },
        barWidth: '60%'
      }
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const param = params[0]
        return `${param.name}<br/>Uplinks: ${param.value}`
      },
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: {
        color: '#f1f5f9',
        fontSize: 12
      },
      axisPointer: {
        type: 'shadow',
        shadowStyle: {
          color: '#94a3b8',
          opacity: 0.2
        }
      }
    }
  }

  return (
    <div className="page-wrapper">
      <div className="page-section">
        <button className="back-button" onClick={() => navigate('/devices')}>Back to Device Overview</button>
      </div>
      
      <div className="page-section">
        <div className="device-detail-header">
          <div className="device-detail-header-info">
            <div className="device-detail-eui">{deviceData.devEui}</div>
            <div className="device-detail-badges">
              <StatusBadge status={deviceData.rfStatus} />
              <StatusBadge status={deviceData.connectivityStatus} />
            </div>
          </div>
        </div>
      </div>

      {lastUplinks.length > 0 && (
        <div className="page-section">
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
        </div>
      )}
    </div>
  )
}

export default DeviceDetail
