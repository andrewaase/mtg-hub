import { useId, useState, useEffect } from 'react'
import logoSvg from '../assets/vaulted_singles_logo.svg'
import { calculateWinRate, calculateStreak, fetchNews } from '../lib/utils'
import { getSnapshots, getGainersLosers, getVelocity } from '../lib/priceHistory'
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

// ── News widget ───────────────────────────────────────────────────────────────
function NewsWidget({ setPage }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const sources = [
    { id: 'mtggoldfish', label: 'MTGGoldfish' },
    { id: 'magic.wizards.com', label: 'Wizards' },
    { id: 'edhrec', label: 'EDHREC' },
  ]
  const [activeSource, setActiveSource] = useState('mtggoldfish')

  useEffect(() => {
    setLoading(true)
    fetchNews(activeSource)
      .then(items => setArticles((items || []).slice(0, 4)))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [activeSource])

  return (
    <div style={{ margin: '12px 16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px' }}>
        <div className="section-title" style={{ padding: 0 }}>MTG News</div>
        <button onClick={() => setPage?.('news')} style={{ fontSize: '.7rem', color: 'var(--accent-teal)', background: 'none', border: 'none', cursor: 'pointer' }}>See all →</button>
      </div>
      {/* Source chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {sources.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSource(s.id)}
            style={{
              padding: '3px 10px', borderRadius: '99px', fontSize: '.68rem',
              fontWeight: 600, cursor: 'pointer', border: '1px solid',
              background: activeSource === s.id ? 'var(--accent-gold)' : 'transparent',
              color: activeSource === s.id ? '#1a1000' : 'var(--text-muted)',
              borderColor: activeSource === s.id ? 'var(--accent-gold)' : 'var(--border)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>Loading…</div>
        ) : articles.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>No articles found</div>
        ) : articles.map((a, i) => (
          <a
            key={i}
            href={a.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', gap: '10px', padding: '10px 12px',
              borderBottom: i < articles.length - 1 ? '1px solid var(--border)' : 'none',
              textDecoration: 'none', color: 'inherit',
              transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {a.image && (
              <img
                src={a.image} alt=""
                style={{ width: '52px', height: '38px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none' }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.8rem', fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {a.title}
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                {new Date(a.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

// ── Tournament Widget ─────────────────────────────────────────────────────────
function TournamentWidget({ collection }) {
  const [format,  setFormat]  = useState('standard')
  const [cards,   setCards]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  const formats = [
    { id: 'standard', label: 'Standard' },
    { id: 'modern',   label: 'Modern'   },
    { id: 'pioneer',  label: 'Pioneer'  },
    { id: 'legacy',   label: 'Legacy'   },
  ]

  useEffect(() => {
    setLoading(true)
    setError(false)
    setCards([])
    // Fetch top-priced nonfoil cards in the format directly from Scryfall.
    // High price is a reliable proxy for tournament demand — staples are expensive
    // because players need multiple copies for competitive decks.
    fetch(
      `https://api.scryfall.com/cards/search?q=f:${format}+is:nonfoil+lang:en+usd>1&order=usd&dir=desc&unique=cards`
    )
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(data => {
        const items = (data.data || []).slice(0, 15).map(c => ({
          name:  c.name,
          price: parseFloat(c.prices?.usd) || null,
          rarity: c.rarity,
        }))
        setCards(items)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [format])

  const ownedNames = new Set(
    (collection || []).map(c => (c.name || '').toLowerCase().trim())
  )

  const top10 = cards.slice(0, 10)

  return (
    <div style={{ margin: '12px 16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px' }}>
        <div className="section-title" style={{ padding: 0 }}>Format Staples</div>
      </div>

      {/* Format chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        {formats.map(f => (
          <button
            key={f.id}
            onClick={() => setFormat(f.id)}
            style={{
              padding: '3px 12px', borderRadius: '99px', fontSize: '.68rem',
              fontWeight: 600, cursor: 'pointer', border: '1px solid',
              background: format === f.id ? 'var(--accent-gold)' : 'transparent',
              color: format === f.id ? '#1a1000' : 'var(--text-muted)',
              borderColor: format === f.id ? 'var(--accent-gold)' : 'var(--border)',
              transition: 'all .15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>Loading…</div>
        ) : error || top10.length === 0 ? (
          <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: '.8rem', textAlign: 'center' }}>
            Could not load tournament data
          </div>
        ) : (
          <>
            {top10.map((card, i) => {
              const owned = ownedNames.has((card.name || '').toLowerCase().trim())
              return (
                <div
                  key={card.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px',
                    borderBottom: i < top10.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: owned ? '3px solid var(--accent-gold)' : '3px solid transparent',
                    background: owned ? 'rgba(201,168,76,.04)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', width: '16px', textAlign: 'right', flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: '.8rem', fontWeight: owned ? 700 : 400, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.name}
                  </span>
                  {owned && (
                    <span style={{
                      background: 'rgba(201,168,76,.18)', color: 'var(--accent-gold)',
                      borderRadius: '4px', padding: '1px 6px',
                      fontSize: '.6rem', fontWeight: 800, flexShrink: 0,
                    }}>
                      ✓ Owned
                    </span>
                  )}
                  {card.price != null && (
                    <span style={{
                      background: 'rgba(245,158,11,.12)', color: '#f59e0b',
                      borderRadius: '4px', padding: '2px 7px',
                      fontSize: '.7rem', fontWeight: 800, flexShrink: 0,
                    }}>
                      ${card.price.toFixed(2)}
                    </span>
                  )}
                </div>
              )
            })}
            <div style={{ padding: '8px 12px', fontSize: '.62rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              Prices via Scryfall · Top-valued {format} singles
            </div>
          </>
        )}
      </div>
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

  const { gainers: vGainers, losers: vLosers } = getVelocity(collection)

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

      {/* ── Hero welcome strip (empty collection) ── */}
      {collection.length === 0 && matches.length === 0 && (
        <div style={{
          margin: '12px 16px 0',
          background: 'linear-gradient(135deg, rgba(201,168,76,0.07) 0%, rgba(139,94,164,0.07) 100%)',
          border: '1px solid rgba(201,168,76,0.18)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <img src={logoSvg} alt="Vaulted Singles" style={{ width: '40px', height: 'auto', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '.95rem', color: 'var(--accent-gold)', letterSpacing: '.5px' }}>VAULTED SINGLES</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Scan a card to start building your vault.</div>
          </div>
          <button onClick={() => setPage?.('collection')} style={{ padding: '6px 14px', borderRadius: '99px', background: 'var(--accent-gold)', color: '#1a1000', border: 'none', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', flexShrink: 0 }}>
            + Add
          </button>
        </div>
      )}

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

      {/* ── 7-Day Movers ── */}
      {(vGainers.length > 0 || vLosers.length > 0) ? (
        <div style={{ margin: '12px 16px 0' }}>
          <div className="section-title" style={{ padding: '0 0 8px' }}>7-Day Movers</div>
          <div className="grid-2">
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-green)', marginBottom: '10px' }}>▲ Gainers</div>
              {vGainers.length === 0
                ? <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>None tracked yet</div>
                : vGainers.map(g => <VelocityRow key={g.name} item={g} type="gain" />)
              }
            </div>
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-red)', marginBottom: '10px' }}>▼ Losers</div>
              {vLosers.length === 0
                ? <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>None tracked yet</div>
                : vLosers.map(l => <VelocityRow key={l.name} item={l} type="loss" />)
              }
            </div>
          </div>
        </div>
      ) : collection.length > 0 && (
        <div className="card" style={{ margin: '12px 16px 0', padding: '14px 16px' }}>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📈</span>
            <span>Price tracking starts after your first daily snapshot.</span>
          </div>
        </div>
      )}

      {/* ── Tournament Demand ── */}
      <TournamentWidget collection={collection} />

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

      {/* ── MTG News ── */}
      <NewsWidget setPage={setPage} />

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

function VelocityRow({ item, type }) {
  const isGain = type === 'gain'
  const color  = isGain ? 'var(--accent-green)' : 'var(--accent-red)'
  const oldPrice = Math.round((item.currentPrice - item.dollar7d / item.qty) * 100) / 100
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }} className="mover-row-last-no-border">
      {item.img
        ? <img src={item.img} alt={item.name} style={{ width: '28px', borderRadius: '3px', flexShrink: 0 }} />
        : <div style={{ width: '28px', height: '40px', background: 'var(--bg-hover)', borderRadius: '3px', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>
          ${oldPrice.toFixed(2)} → ${item.currentPrice.toFixed(2)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: '.82rem', fontWeight: 800, color,
          background: isGain ? 'rgba(74,222,128,.1)' : 'rgba(248,113,113,.1)',
          borderRadius: '5px', padding: '1px 6px',
        }}>
          {isGain ? '+' : ''}{item.pct7d}%
        </div>
        <div style={{ fontSize: '.62rem', color, opacity: .8, marginTop: '2px' }}>
          {item.dollar7d > 0 ? '+' : ''}${Math.abs(item.dollar7d).toFixed(2)}
        </div>
      </div>
    </div>
  )
}
