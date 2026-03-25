import { calculateWinRate, calculateStreak, formatDate } from '../lib/utils'

export default function Dashboard({ matches, collection, openLogMatch }) {
  const winRate = calculateWinRate(matches)
  const streak = calculateStreak(matches)
  const collectionTotal = collection.reduce((sum, c) => sum + c.qty, 0)

  const stats = [
    { label: 'Win Rate', value: `${winRate}%`, icon: '📈', class: 'gold' },
    { label: 'Total Matches', value: matches.length, icon: '⚔️', class: 'blue' },
    { label: 'Current Streak', value: `${streak.count} ${streak.type}`, icon: '🔥', class: streak.type === 'win' ? 'green' : 'red' },
    { label: 'Collection Size', value: collectionTotal, icon: '📦', class: 'purple' },
  ]

  const matchupSummary = {}
  matches.forEach(m => {
    if (!matchupSummary[m.oppType]) matchupSummary[m.oppType] = { wins: 0, total: 0 }
    matchupSummary[m.oppType].total++
    if (m.result === 'win') matchupSummary[m.oppType].wins++
  })

  return (
    <div>
      <div className="grid-4 mb-24">
        {stats.map((s, i) => (
          <div key={i} className={`stat-card ${s.class}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-icon">{s.icon}</div>
          </div>
        ))}
      </div>

      <div className="grid-2 gap-20">
        <div>
          <div className="section-title">⚔️ Recent Matches</div>
          <div className="card">
            {matches.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div className="empty-icon">⚔️</div>
                <p>No matches logged yet.<br/><strong>+ Log Match</strong> to start!</p>
                <button className="btn btn-primary" onClick={openLogMatch} style={{ marginTop: '16px' }}>+ Log Match</button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="match-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Format</th>
                      <th>Deck</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.slice(0, 5).map(m => (
                      <tr key={m.id}>
                        <td>{formatDate(m.date)}</td>
                        <td><span className="badge badge-format">{m.format}</span></td>
                        <td>{m.myDeck}</td>
                        <td><span className={`badge badge-${m.result}`}>{m.result.toUpperCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="section-title">🎯 Matchup Summary</div>
          <div className="card">
            {Object.entries(matchupSummary).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '.9rem', textAlign: 'center', padding: '24px' }}>
                No matches yet
              </div>
            ) : (
              Object.entries(matchupSummary).map(([archetype, data]) => {
                const wr = Math.round((data.wins / data.total) * 100)
                return (
                  <div key={archetype} className="matchup-row">
                    <div className="matchup-name">{archetype}</div>
                    <div className="matchup-bar">
                      <div className="wr-bar-track">
                        <div className="wr-bar-fill" style={{ width: `${wr}%`, background: wr > 50 ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                      </div>
                    </div>
                    <div className="matchup-wr">{wr}%</div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
