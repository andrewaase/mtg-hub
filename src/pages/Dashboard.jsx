import { useId } from 'react'
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

// ── Circular donut chart ──────────────────────────────────────────────────────
function DonutChart({ total, delta, deltaPercent, cardCount }) {
  const uid  = useId()
  const r    = 68
  const circ = 2 * Math.PI * r
  const fill = total > 0 ? Math.max(0.06, Math.min(0.88, 0.72)) * circ : 0.06 * circ
  const positive = delta == null || delta >= 0

  return (
    <div className="donut-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <defs>
          <linearGradient id={`dg-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#f59e0b', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#fbbf24', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx="90" cy="90" r={r} fill="none" stroke="#222226" strokeWidth="14" />
        {/* Fill */}
        <circle
          cx="90" cy="90" r={r}
          fill="none"
          stroke={`url(#dg-${uid})`}
          strokeWidth="14"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 90 90)"
        />
        {/* Delta */}
        <text x="90" y="74" textAnchor="middle" fill={positive ? '#4ade80' : '#f87171'} fontSize="12" fontWeight="700">
          {delta != null
            ? `${delta >= 0 ? '+' : ''}${fmtShort(Math.abs(delta))} (${deltaPercent >= 0 ? '+' : ''}${deltaPercent?.toFixed(1)}%)`
            : '+$0.00 (0.0%)'
          }
        </text>
        {/* Main value */}
        <text x="90" y="96" textAnchor="middle" fill="#f5f5f5" fontSize="22" fontWeight="800">
          ${fmt(total)}
        </text>
        {/* Card count */}
        <text x="90" y="114" textAnchor="middle" fill="#444448" fontSize="12">
          {cardCount} card{cardCount !== 1 ? 's' : ''}
        </text>
      </svg>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard({ matches, collection, openLogMatch, setPage }) {
  const winRate = calculateWinRate(matches)
  const streak  = calculateStreak(matches)

  const wins   = matches.filter(m => m.result === 'win').length
  const losses = matches.filter(m => m.result === 'loss').length

  const totalMid   = collection.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
  const totalCards = collection.reduce((s, c) => s + (c.qty || 1), 0)

  const snapshots  = getSnapshots(30)
  const chartData  = snapshots.map(s => s.totalMid)
  const chartLabels = snapshots.map(s => s.date.slice(5))

  const delta7d = (() => {
    if (snapshots.length < 2) return null
    const old = snapshots.length >= 8 ? snapshots[snapshots.length - 8] : snapshots[0]
    const chg = totalMid - old.totalMid
    const pct = old.totalMid > 0 ? (chg / old.totalMid) * 100 : 0
    return { chg: Math.round(chg * 100) / 100, pct: Math.round(pct * 10) / 10 }
  })()

  const delta30d = (() => {
    if (snapshots.length < 2) return null
    const old = snapshots[0]
    const chg = totalMid - old.totalMid
    const pct = old.totalMid > 0 ? (chg / old.totalMid) * 100 : 0
    return { chg: Math.round(chg * 100) / 100, pct: Math.round(pct * 10) / 10 }
  })()

  const chartColor = delta30d == null || delta30d.chg >= 0 ? '#f59e0b' : '#f87171'
  const hasTrend   = snapshots.length >= 2

  const { gainers, losers } = getGainersLosers(collection)
  const hasMovers = gainers.length > 0 || losers.length > 0

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

      {/* ── Quick Actions ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div className="quickaction-grid">
          <button className="quickaction-card" onClick={() => setPage?.('collection')}>
            <span className="quickaction-card-icon">⇄</span>
            <span className="quickaction-card-label">My Listings</span>
          </button>
          <button className="quickaction-card" onClick={() => setPage?.('cards')}>
            <span className="quickaction-card-icon">📖</span>
            <span className="quickaction-card-label">Card Lookup</span>
          </button>
          <button className="quickaction-card quickaction-wide" onClick={async () => {
            try {
              const res = await fetch('https://api.scryfall.com/cards/random')
              if (res.ok) {
                const card = await res.json()
                window.__randomCard = card
                setPage?.('cards')
              }
            } catch { /* ignore */ }
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="quickaction-card-icon">🎲</span>
              <span className="quickaction-card-label">Random Card</span>
            </div>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Discover something new →</span>
          </button>
        </div>
      </div>

      {/* ── Portfolio Donut ── */}
      <div className="card" style={{ margin: '12px 16px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 0' }}>
          <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)' }}>Collection Value</div>
          <button onClick={() => setPage?.('collection')} style={{ fontSize: '.7rem', color: 'var(--accent-teal)', background: 'none', border: 'none', cursor: 'pointer' }}>View All →</button>
        </div>
        <DonutChart
          total={totalMid}
          delta={delta7d?.chg ?? null}
          deltaPercent={delta7d?.pct ?? null}
          cardCount={totalCards}
        />
        {/* Low / Mid / High strip */}
        {collection.length > 0 && (
          <div style={{ display: 'flex', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
            {[['Low', totalMid * 0.80], ['Mid', totalMid], ['High', totalMid * 1.25]].map(([label, val]) => (
              <div key={label} style={{ flex: 1, padding: '10px 8px', textAlign: 'center', borderRight: label !== 'High' ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                <div style={{ fontSize: '.82rem', fontWeight: 700, color: label === 'Mid' ? 'var(--accent-teal)' : 'var(--text-secondary)', marginTop: '2px' }}>${fmt(val)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 30-day Chart ── */}
      {hasTrend ? (
        <div className="card" style={{ margin: '12px 16px 0', padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
            <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>30-Day Value</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {delta7d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>7d</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: delta7d.chg >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {delta7d.chg >= 0 ? '+' : ''}{delta7d.pct}%
                  </div>
                </div>
              )}
              {delta30d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>30d</div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: delta30d.chg >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {delta30d.chg >= 0 ? '+' : ''}{delta30d.pct}%
                  </div>
                </div>
              )}
            </div>
          </div>
          <SparklineChart data={chartData} labels={chartLabels} height={90} color={chartColor} showArea showLabels />
        </div>
      ) : collection.length > 0 && (
        <div className="card" style={{ margin: '12px 16px 0', padding: '14px 16px' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈</span>
            <span>Portfolio chart appears after your first daily snapshot.</span>
          </div>
        </div>
      )}

      {/* ── Price Movers ── */}
      {hasMovers && (
        <div style={{ margin: '12px 16px 0' }}>
          <div className="section-title" style={{ padding: '0 0 8px' }}>Price Movers</div>
          <div className="grid-2">
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-green)', marginBottom: '10px' }}>▲ Gainers</div>
              {gainers.length === 0
                ? <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>None tracked yet</div>
                : gainers.map(g => <MoverRow key={g.name} item={g} type="gain" />)
              }
            </div>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-red)', marginBottom: '10px' }}>▼ Losers</div>
              {losers.length === 0
                ? <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>None tracked yet</div>
                : losers.map(l => <MoverRow key={l.name} item={l} type="loss" />)
              }
            </div>
          </div>
        </div>
      )}

      {/* ── Win Rate Strip ── */}
      {matches.length > 0 && (
        <div className="stats-strip" style={{ margin: '12px 16px 0' }}>
          <div className="stat-card gold">
            <div className="stat-label">Win Rate</div>
            <div className="stat-value">{winRate}%</div>
            <div className="stat-sub">{wins}W – {losses}L</div>
            <div className="stat-icon">📈</div>
          </div>
          <div className={`stat-card ${streakClass}`}>
            <div className="stat-label">Streak</div>
            <div className="stat-value">{streak.count > 0 ? `${streak.count}${streakLabel}` : '—'}</div>
            <div className="stat-sub">{streak.count > 0 ? (streak.type === 'win' ? 'Win streak' : 'Loss streak') : 'No matches yet'}</div>
            <div className="stat-icon">🔥</div>
          </div>
        </div>
      )}

      {/* ── Recent Matches ── */}
      <div style={{ margin: '12px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px' }}>
          <div className="section-title" style={{ padding: 0 }}>Recent Matches</div>
          <button onClick={openLogMatch} style={{ fontSize: '.72rem', color: 'var(--accent-teal)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Log</button>
        </div>
        <div className="card">
          {matches.length === 0 ? (
            <div className="empty-state" style={{ padding: '28px 20px' }}>
              <div className="empty-icon">⚔️</div>
              <p>No matches logged yet.</p>
              <button className="btn btn-primary" onClick={openLogMatch} style={{ marginTop: '14px' }}>+ Log Match</button>
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
                    <div className="match-meta-row">vs {m.oppDeck || m.oppType || 'Unknown'} · <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{m.format}</span></div>
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
      </div>

      {/* ── Matchup Summary ── */}
      {Object.keys(matchupSummary).length > 0 && (
        <div style={{ margin: '12px 16px 16px' }}>
          <div className="section-title" style={{ padding: '0 0 8px' }}>Matchup Summary</div>
          <div className="card">
            {Object.entries(matchupSummary).map(([archetype, data]) => {
              const wr = Math.round((data.wins / data.total) * 100)
              return (
                <div key={archetype} className="matchup-row">
                  <div className="matchup-name">{archetype}</div>
                  <div className="matchup-bar">
                    <div className="wr-bar-track">
                      <div className="wr-bar-fill" style={{ width: `${wr}%`, background: wr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                    </div>
                  </div>
                  <div className="matchup-wr" style={{ color: wr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{wr}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

function MoverRow({ item, type }) {
  const isGain = type === 'gain'
  const color  = isGain ? 'var(--accent-green)' : 'var(--accent-red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }} className="mover-row-last-no-border">
      {item.img
        ? <img src={item.img} alt={item.name} style={{ width: '28px', borderRadius: '3px', flexShrink: 0 }} />
        : <div style={{ width: '28px', height: '40px', background: 'var(--bg-hover)', borderRadius: '3px', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>${item.oldPrice} → ${item.newPrice}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '.82rem', fontWeight: 800, color }}>{isGain ? '+' : ''}{item.pctChange}%</div>
        <div style={{ fontSize: '.62rem', color, opacity: .8 }}>{item.dollarChange > 0 ? '+' : ''}${Math.abs(item.dollarChange).toFixed(2)}</div>
      </div>
    </div>
  )
}
