import { useState, useEffect } from 'react'
import './RFStabilityIndicator.css'

function RFStabilityIndicator() {
  const [reliability, setReliability] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReliability = async () => {
      try {
        const response = await fetch('/api/uplinks/reliability')
        if (response.ok) {
          const data = await response.json()
          setReliability(data)
        }
      } catch (error) {
        console.error('Error fetching uplink reliability:', error)
      } finally {
        setLoading(false)
      }
    }

    // Initial fetch
    fetchReliability()

    // Poll every 5 seconds
    const interval = setInterval(fetchReliability, 5000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className="rf-stability-indicator">Loading stability data...</div>
  }

  if (!reliability) {
    return <div className="rf-stability-indicator">No reliability data available</div>
  }

  const isStable = reliability.classification === 'Stable'
  const statusClass = isStable ? 'stable' : 'unstable'

  return (
    <div className={`rf-stability-indicator rf-stability-indicator--${statusClass}`}>
      <div className="rf-stability-label">RF Stability</div>
      <div className="rf-stability-value">
        <span className={`rf-stability-badge rf-stability-badge--${statusClass}`}>
          {reliability.classification || 'UNKNOWN'}
        </span>
        {reliability.stddev_snr !== null && (
          <span className="rf-stability-stddev">
            SNR σ: {reliability.stddev_snr}
          </span>
        )}
      </div>
    </div>
  )
}

export default RFStabilityIndicator
