import { calculateWinRate, calculateStreak, formatDate } from '../lib/utils'
import { getSnapshots, getGainersLosers } from '../lib/priceHistory'
import SparklineChart from '../components/SparklineChart'

function fmt(n) {
  return n != null
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'
}

function fmtShort(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

export default function Dashboard({ matches, collection, openLogMatch }) {
  const winRate = calculateWinRate(matches)
  const streak  = calculateStreak(matches)

  const wins   = matches.filter(m => m.result === 'win').length
  const losses = matches.filter(m => m.result === 'loss').length

  // Portfolio value
  const totalMid  = collection.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
  const totalLow  = totalMid * 0.80
  const totalHigh = totalMid * 1.25
  const totalCards = collection.reduce((s, c) => s + (c.qty || 1), 0)

  // Chart & deltas
  const snapshots = getSnapshots(30)
  const chartData   = snapshots.map(s => s.totalMid)
  const chartLabels = snapshots.map(s => s.date.slice(5)) // MM-DD

  const delta7d  = (() => {
    if (snapshots.length < 2) return null
    const old = snapshots.length >= 8 ? snapshots[snapshots.length - 8] : snapshots[0]
    const now = totalMid
    const chg = now - old.totalMid
    const pct = old.totalMid > 0 ? (chg / old.totalMid) * 100 : 0
    return { chg: Math.round(chg * 100) / 100, pct: Math.round(pct * 10) / 10 }
  })()

  const delta30d = (() => {
    if (snapshots.length < 2) return null
    const old = snapshots[0]
    const now = totalMid
    const chg = now - old.totalMid
    const pct = old.totalMid > 0 ? (chg / old.totalMid) * 100 : 0
    return { chg: Math.round(chg * 100) / 100, pct: Math.round(pct * 10) / 10 }
  })()

  const chartColor   = delta30d == null || delta30d.chg >= 0 ? '#3ecfb2' : '#f0647a'
  const hasTrend     = snapshots.length >= 2

  // Gainers / losers
  const { gainers, losers } = getGainersLosers(collection)
  const hasMovers = gainers.length > 0 || losers.length > 0

  // Matchup summary
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
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>via Scryfall</div>
        </div>

        {collection.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '.88rem', paddingBottom: '4px' }}>
            Add cards to see your portfolio value
          </div>
        ) : (
          <>
            <div className="portfolio-value">${fmt(totalMid)}</div>
            <div className="portfolio-subtitle">
              {totalCards.toLocaleString()} card{totalCards !== 1 ? 's' : ''} · {collection.length} unique
              {delta7d != null && (
                <span style={{ marginLeft: '10px', color: delta7d.chg >= 0 ? 'var(--accent-teal)' : 'var(--accent-red)', fontWeight: 700 }}>
                  {delta7d.chg >= 0 ? '▲' : '▼'} {fmtShort(Math.abs(delta7d.chg))} (7d)
                </span>
              )}
            </div>
            <div className="portfolio-tiers">
              <div className="portfolio-tier low">
                <div className="portfolio-tier-label">Low</div>
                <div className="portfolio-tier-value">${fmt(totalLow)}</div>
              </div>
              <div className="portfolio-tier mid">
                <div className="portfolio-tier-label">Mid</div>
                <div className="portfolio-tier-value">${fmt(totalMid)}</div>
              </div>
              <div className="portfolio-tier high">
                <div className="portfolio-tier-label">High</div>
                <div className="portfolio-tier-value">${fmt(totalHigh)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Collection Value Chart ── */}
      {hasTrend ? (
        <div className="card mb-20" style={{ padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>
              30-Day Value
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {delta7d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>7d</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: delta7d.chg >= 0 ? 'var(--accent-teal)' : 'var(--accent-red)' }}>
                    {delta7d.chg >= 0 ? '+' : ''}{delta7d.pct}%
                  </div>
                </div>
              )}
              {delta30d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>30d</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: delta30d.chg >= 0 ? 'var(--accent-teal)' : 'var(--accent-red)' }}>
                    {delta30d.chg >= 0 ? '+' : ''}{delta30d.pct}%
                  </div>
                </div>
              )}
            </div>
          </div>
          <SparklineChart
            data={chartData}
            labels={chartLabels}
            height={90}
            color={chartColor}
            showArea
            showLabels
          />
        </div>
      ) : collection.length > 0 && (
        <div className="card mb-20" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈</span>
            <span>Portfolio chart will appear after your first daily snapshot. Come back tomorrow!</span>
          </div>
        </div>
      )}

      {/* ── Stats Strip ── */}
      <div className="stats-strip">
        <div className="stat-card gold">
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

      {/* ── Gainers / Losers ── */}
      {hasMovers && (
        <>
          <div className="section-title">Price Movers</div>
          <div className="grid-2 mb-20">
            {/* Gainers */}
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-green)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                ▲ Gainers
              </div>
              {gainers.length === 0
                ? <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>No gainers tracked yet</div>
                : gainers.map(g => <MoverRow key={g.name} item={g} type="gain" />)
              }
            </div>

            {/* Losers */}
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-red)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                ▼ Losers
              </div>
              {losers.length === 0
                ? <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>No losers tracked yet</div>
                : losers.map(l => <MoverRow key={l.name} item={l} type="loss" />)
              }
            </div>
          </div>
        </>
      )}

      {/* ── Recent Matches ── */}
      <div className="section-title">Recent Matches</div>
      <div className="card mb-20">
        {matches.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            <div className="empty-icon">⚔️</div>
            <p>No matches logged yet.</p>
            <button className="btn btn-primary" onClick={openLogMatch} style={{ marginTop: '14px' }}>
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
                    vs {m.oppDeck || m.oppType || 'Unknown'} ·{' '}
                    <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>{m.format}</span>
                  </div>
                </div>
                <div className="match-item-right">
                  <div className="match-item-date">{formatDate(m.date)}</div>
                </div>
              </div>
            ))}
            {matches.length > 5 && (
              <div style={{ textAlign: 'center', padding: '10px 0 0', fontSize: '.75rem', color: 'var(--text-muted)' }}>
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

// ── Mover row ─────────────────────────────────────────────────────────────────

function MoverRow({ item, type }) {
  const isGain = type === 'gain'
  const color  = isGain ? 'var(--accent-green)' : 'var(--accent-red)'
  const sign   = isGain ? '+' : ''

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}
         className="mover-row-last-no-border">
      {item.img
        ? <img src={item.img} alt={item.name} style={{ width: '28px', borderRadius: '3px', flexShrink: 0 }} />
        : <div style={{ width: '28px', height: '40px', background: 'var(--bg-hover)', borderRadius: '3px', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name}
        </div>
        <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>
          ${item.oldPrice} → ${item.newPrice}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '.82rem', fontWeight: 800, color }}>{sign}{item.pctChange}%</div>
        <div style={{ fontSize: '.62rem', color, opacity: .8 }}>
          {sign}{item.dollarChange >= 0 ? '' : ''}{item.dollarChange > 0 ? '+' : ''}${Math.abs(item.dollarChange).toFixed(2)}
        </div>
      </div>
    </div>
  )
}
