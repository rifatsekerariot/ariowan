import './StatusBadge.css'

function StatusBadge({ status }) {
  if (!status) return null

  const statusLower = status.toLowerCase()
  let badgeClass = 'status-badge'
  
  if (statusLower === 'healthy') {
    badgeClass += ' status-badge--healthy'
  } else if (statusLower === 'degraded') {
    badgeClass += ' status-badge--degraded'
  } else if (statusLower === 'critical') {
    badgeClass += ' status-badge--critical'
  } else if (statusLower === 'offline') {
    badgeClass += ' status-badge--offline'
  } else {
    badgeClass += ' status-badge--default'
  }

  return (
    <span className={badgeClass}>
      {status.toUpperCase()}
    </span>
  )
}

export default StatusBadge
