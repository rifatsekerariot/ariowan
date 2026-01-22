import { useState, useEffect } from 'react'
import SummaryCards from './SummaryCards.jsx'
import './DashboardKPIs.css'

function DashboardKPIs() {
  const [kpiData, setKpiData] = useState({
    avgSnr: null,
    avgRssi: null,
    downlinkSuccess: null,
    activeDevices: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        setLoading(true)

        // Calculate time ranges
        const now = new Date()
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

        // Fetch all gateways
        const gatewaysResponse = await fetch('/api/gateways/health')
        const gateways = gatewaysResponse.ok ? await gatewaysResponse.json() : []

        // Fetch metrics for each gateway (last 1h) and aggregate
        let totalSnr = 0
        let totalRssi = 0
        let gatewayCount = 0

        for (const gateway of gateways) {
          try {
            const metricsResponse = await fetch(
              `/api/gateways/${gateway.gatewayId}/metrics?from=${encodeURIComponent(oneHourAgo)}&to=${encodeURIComponent(now.toISOString())}`
            )
            if (metricsResponse.ok) {
              const metrics = await metricsResponse.json()
              if (metrics.avgSnr !== null && metrics.avgRssi !== null) {
                totalSnr += metrics.avgSnr
                totalRssi += metrics.avgRssi
                gatewayCount++
              }
            }
          } catch (error) {
            console.error(`Error fetching metrics for gateway ${gateway.gatewayId}:`, error)
          }
        }

        // Calculate averages
        const avgSnr = gatewayCount > 0 ? (totalSnr / gatewayCount).toFixed(1) : null
        const avgRssi = gatewayCount > 0 ? (totalRssi / gatewayCount).toFixed(1) : null

        // Fetch active devices (last 24h)
        const devicesResponse = await fetch('/api/devices/health')
        const devices = devicesResponse.ok ? await devicesResponse.json() : []
        const activeDevices = devices.filter(device => {
          if (!device.lastSeen) return false
          const lastSeen = new Date(device.lastSeen)
          return lastSeen >= new Date(twentyFourHoursAgo)
        }).length

        // Downlink success - no endpoint available, set to null
        // This would require a new endpoint to query downlink_events table
        const downlinkSuccess = null

        setKpiData({
          avgSnr,
          avgRssi,
          downlinkSuccess,
          activeDevices,
        })
      } catch (error) {
        console.error('Error fetching KPI data:', error)
      } finally {
        setLoading(false)
      }
    }

    // Initial fetch
    fetchKPIs()

    // Poll every 30 seconds
    const interval = setInterval(fetchKPIs, 30000)

    return () => clearInterval(interval)
  }, [])

  if (loading && kpiData.avgSnr === null) {
    return (
      <div className="dashboard-kpis">
        <div className="page-section">
          <p>Loading KPIs...</p>
        </div>
      </div>
    )
  }

  const kpiStats = [
    {
      title: 'Avg SNR (1h)',
      value: kpiData.avgSnr !== null ? `${kpiData.avgSnr} dB` : 'N/A',
      type: kpiData.avgSnr !== null ? (kpiData.avgSnr >= 7 ? 'healthy' : kpiData.avgSnr >= 3 ? 'degraded' : 'critical') : 'default',
    },
    {
      title: 'Avg RSSI (1h)',
      value: kpiData.avgRssi !== null ? `${kpiData.avgRssi} dBm` : 'N/A',
      type: kpiData.avgRssi !== null ? (kpiData.avgRssi >= -90 ? 'healthy' : kpiData.avgRssi >= -105 ? 'degraded' : 'critical') : 'default',
    },
    {
      title: 'Downlink Success %',
      value: kpiData.downlinkSuccess !== null ? `${kpiData.downlinkSuccess}%` : 'N/A',
      type: kpiData.downlinkSuccess !== null ? (kpiData.downlinkSuccess >= 95 ? 'healthy' : kpiData.downlinkSuccess >= 80 ? 'degraded' : 'critical') : 'default',
    },
    {
      title: 'Active Devices (24h)',
      value: kpiData.activeDevices,
      type: 'default',
    },
  ]

  return (
    <div className="dashboard-kpis">
      <SummaryCards stats={kpiStats} />
    </div>
  )
}

export default DashboardKPIs
