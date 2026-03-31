import { calculateWinRate, calculateStreak, formatDate } from '../lib/utils'

function formatMoney(val) {
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Dashboard({ matches, collection, openLogMatch }) {
  const winRate = calculateWinRate(matches)
  const streak = calculateStreak(matches)

  // Portfolio value — uses Scryfall market price (usd field) stored per card.
  // Low ≈ 80% of market (conservative sell), Mid = market, High ≈ 125% (retail high).
  const totalMid = collection.reduce((sum, c) => sum + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
  const totalLow = totalMid * 0.80
  const totalHigh = totalMid * 1.25
  const totalCards = collection.reduce((sum, c) => sum + (c.qty || 1), 0)

  const wins   = matches.filter(m => m.result === 'win').length
  const losses = matches.filter(m => m.result === 'loss').length

  const matchupSummary = {}
  matches.forEach(m => {
    if (!m.oppType) return
    if (!matchupSummary[m.oppType]) matchupSummary[m.oppType] = { wins: 0, total: 0 }
    matchupSummary[m.oppType].total++
    if (m.result === 'win') matchupSummary[m.oppType].wins++
  })

  const streakLabel = streak.type === 'win' ? 'W' : streak.type === 'loss' ? 'L' : '—'
  const streakClass = streak.type === 'win' ? 'green' : streak.type === 'loss' ? 'red' : 'blue'

  return (
    <div>

      {/* ── Portfolio Value Hero ── */}
      <div className="portfolio-hero">
        <div className="portfolio-hero-header">
          <div className="portfolio-label">Portfolio Value</div>
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
            via Scryfall
          </div>
        </div>

        {collection.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '.9rem', paddingBottom: '4px' }}>
            Add cards to see your portfolio value
          </div>
        ) : (
          <>
            <div className="portfolio-value">${formatMoney(totalMid)}</div>
            <div className="portfolio-subtitle">
              {totalCards.toLocaleString()} card{totalCards !== 1 ? 's' : ''} · {collection.length} unique
            </div>
            <div className="portfolio-tiers">
              <div className="portfolio-tier low">
                <div className="portfolio-tier-label">Low</div>
                <div className="portfolio-tier-value">${formatMoney(totalLow)}</div>
              </div>
              <div className="portfolio-tier mid">
                <div className="portfolio-tier-label">Mid</div>
                <div className="portfolio-tier-value">${formatMoney(totalMid)}</div>
              </div>
              <div className="portfolio-tier high">
                <div className="portfolio-tier-label">High</div>
                <div className="portfolio-tier-value">${formatMoney(totalHigh)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Stats Strip ── */}
      <div className="stats-strip">
        <div className={`stat-card gold`}>
          <div className="stat-label">Win Rate</div>
          <div className="stat-value">{winRate}%</div>
          <div className="stat-sub">{wins}W – {losses}L</div>
          <div className="stat-icon">📈</div>
        </div>

        <div className={`stat-card ${streakClass}`}>
          <div className="stat-label">Streak</div>
          <div className="stat-value">
            {streak.count > 0 ? `${streak.count}${streakLabel}` : '—'}
          </div>
          <div className="stat-sub">
            {streak.count > 0
              ? streak.type === 'win' ? 'Win streak' : 'Loss streak'
              : 'No matches yet'}
          </div>
          <div className="stat-icon">🔥</div>
        </div>
      </div>

      {/* ── Recent Matches ── */}
      <div className="section-title">Recent Matches</div>
      <div className="card mb-20">
        {matches.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            <div className="empty-icon">⚔️</div>
            <p>No matches logged yet.</p>
            <button
              className="btn btn-primary"
              onClick={openLogMatch}
              style={{ marginTop: '14px' }}
            >
              + Log Match
            </button>
          </div>
        ) : (
          <>
            {matches.slice(0, 5).map(m => (
              <div key={m.id} className="match-item">
                <div className={`match-result-indicator ${m.result}`}>
                  {m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'}
                </div>
                <div className="match-info">
                  <div className="match-deck-name">{m.myDeck || 'Unknown Deck'}</div>
                  <div className="match-meta-row">
                    vs {m.oppDeck || m.oppType || 'Unknown'} · <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>{m.format}</span>
                  </div>
                </div>
                <div className="match-item-right">
                  <div className="match-item-date">{formatDate(m.date)}</div>
                </div>
              </div>
            ))}
            {matches.length > 5 && (
              <div style={{
                textAlign: 'center',
                padding: '12px 0 0',
                fontSize: '.78rem',
                color: 'var(--text-muted)'
              }}>
                {matches.length - 5} more · see Match Log
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Matchup Summary ── */}
      {Object.keys(matchupSummary).length > 0 && (
        <>
          <div className="section-title">Matchup Summary</div>
          <div className="card">
            {Object.entries(matchupSummary).map(([archetype, data]) => {
              const wr = Math.round((data.wins / data.total) * 100)
              return (
                <div key={archetype} className="matchup-row">
                  <div className="matchup-name">{archetype}</div>
                  <div className="matchup-bar">
                    <div className="wr-bar-track">
                      <div
                        className="wr-bar-fill"
                        style={{
                          width: `${wr}%`,
                          background: wr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)',
                        }}
                      />
                    </div>
                  </div>
                  <div className="matchup-wr" style={{ color: wr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {wr}%
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
