import './SummaryCards.css'

function SummaryCards({ stats }) {
  if (!stats || stats.length === 0) {
    return null
  }

  const getCardType = (title) => {
    const lowerTitle = title.toLowerCase()
    if (lowerTitle.includes('healthy')) return 'healthy'
    if (lowerTitle.includes('degraded')) return 'degraded'
    if (lowerTitle.includes('critical')) return 'critical'
    return 'default'
  }

  return (
    <div className="summary-cards">
      {stats.map((stat, index) => {
        const cardType = stat.type || getCardType(stat.title)
        return (
          <div key={index} className={`summary-card summary-card--${cardType}`}>
            <div className="summary-card-title">{stat.title}</div>
            <div className="summary-card-value">{stat.value}</div>
          </div>
        )
      })}
    </div>
  )
}

export default SummaryCards
