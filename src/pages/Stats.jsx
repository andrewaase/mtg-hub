import { calculateWinRate } from '../lib/utils'

export default function Stats({ matches }) {
  const byDeck = {}
  const byOpponent = {}
  const byFormat = {}

  matches.forEach(m => {
    if (!byDeck[m.myDeck]) byDeck[m.myDeck] = { wins: 0, total: 0 }
    if (!byOpponent[m.oppType]) byOpponent[m.oppType] = { wins: 0, total: 0 }
    if (!byFormat[m.format]) byFormat[m.format] = { wins: 0, total: 0 }

    byDeck[m.myDeck].total++
    byOpponent[m.oppType].total++
    byFormat[m.format].total++

    if (m.result === 'win') {
      byDeck[m.myDeck].wins++
      byOpponent[m.oppType].wins++
      byFormat[m.format].wins++
    }
  })

  const renderStats = (data) => (
    Object.entries(data).length === 0 ? (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No data</div>
    ) : (
      Object.entries(data).sort((a, b) => b[1].total - a[1].total).map(([name, stats]) => {
        const wr = Math.round((stats.wins / stats.total) * 100)
        return (
          <div key={name} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '.85rem' }}>
              <span>{name}</span>
              <span style={{ color: 'var(--accent-gold)' }}>{wr}% ({stats.wins}-{stats.total - stats.wins})</span>
            </div>
            <div className="wr-bar-track">
              <div className="wr-bar-fill" style={{ width: `${wr}%`, background: wr > 50 ? 'var(--accent-green)' : wr === 50 ? 'var(--accent-blue)' : 'var(--accent-red)' }} />
            </div>
          </div>
        )
      })
    )
  )

  return (
    <div className="grid-2 gap-20 mb-20">
      <div>
        <div className="section-title">📈 Win Rate by Deck</div>
        <div className="card">{renderStats(byDeck)}</div>
      </div>
      <div>
        <div className="section-title">🎯 vs. Archetype</div>
        <div className="card">{renderStats(byOpponent)}</div>
      </div>
      <div>
        <div className="section-title">🗂️ By Format</div>
        <div className="card">{renderStats(byFormat)}</div>
      </div>
      <div>
        <div className="section-title">📊 Summary</div>
        <div className="card">
          <div style={{ fontSize: '.9rem' }}>
            <div style={{ marginBottom: '8px' }}>Total Matches: <strong>{matches.length}</strong></div>
            <div style={{ marginBottom: '8px' }}>Overall Win Rate: <strong>{calculateWinRate(matches)}%</strong></div>
            <div>Unique Decks: <strong>{Object.keys(byDeck).length}</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}
