import { useId, useState, useEffect } from 'react'
import logoPng from '../assets/vaulted_singles_logo.png'
import { calculateWinRate, calculateStreak, fetchNews } from '../lib/utils'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { getManaPoolLink } from '../lib/manapool'
import { getSnapshots } from '../lib/priceHistory'
import { fetchMarketMovers } from '../lib/marketPrices'
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
    { id: 'edhrec',      label: 'EDHREC'      },
    { id: 'community',   label: 'r/magicTCG'  },
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
function TournamentWidget({ collection, setPage }) {
  const [format,     setFormat]     = useState('standard')
  const [cards,      setCards]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)
  const [shownCount, setShownCount] = useState(10)

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
    // Fetch top-priced nonfoil BASE-version cards in the format from Scryfall.
    // Exclude showcase, extended-art, borderless, and promo frames so that
    // only the regular printing price is returned (avoids alt-art inflation).
    fetch(
      `https://api.scryfall.com/cards/search?q=f:${format}+is:nonfoil+lang:en+-frame:showcase+-frame:extendedart+-border:borderless+-is:promo+usd>0.5&order=usd&dir=desc&unique=cards`
    )
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(data => {
        const items = (data.data || []).slice(0, 30).map(c => ({
          name:   c.name,
          price:  parseFloat(c.prices?.usd) || null,
          rarity: c.rarity,
          tcgUrl: c.purchase_uris?.tcgplayer || null,
        }))
        setCards(items)
        setShownCount(10)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [format])

  const ownedNames = new Set(
    (collection || []).map(c => (c.name || '').toLowerCase().trim())
  )

  const visibleCards = cards.slice(0, shownCount)
  const hasMore      = cards.length > shownCount

  const handleCardClick = (cardName) => {
    window.__lookupCardName = cardName
    setPage?.('cards')
  }

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
        ) : error || cards.length === 0 ? (
          <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: '.8rem', textAlign: 'center' }}>
            Could not load tournament data
          </div>
        ) : (
          <>
            {visibleCards.map((card, i) => {
              const owned = ownedNames.has((card.name || '').toLowerCase().trim())
              return (
                <div
                  key={card.name}
                  onClick={() => handleCardClick(card.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px',
                    borderBottom: i < visibleCards.length - 1 ? '1px solid var(--border)' : 'none',
                    borderLeft: owned ? '3px solid var(--accent-gold)' : '3px solid transparent',
                    background: owned ? 'rgba(201,168,76,.04)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = owned ? 'rgba(201,168,76,.09)' : 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = owned ? 'rgba(201,168,76,.04)' : 'transparent'}
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
                  <a
                    href={getTCGPlayerLink(card.tcgUrl || card.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: 'rgba(74,222,128,.12)', color: '#4ade80',
                      borderRadius: '4px', padding: '2px 7px',
                      fontSize: '.68rem', fontWeight: 700, flexShrink: 0,
                      textDecoration: 'none', lineHeight: 1.6,
                    }}
                    title="Buy on TCGPlayer"
                  >
                    🛒
                  </a>
                  <a
                    href={getManaPoolLink({ name: card.name })}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      background: 'rgba(56,189,248,.12)', color: '#38bdf8',
                      borderRadius: '4px', padding: '2px 7px',
                      fontSize: '.68rem', fontWeight: 700, flexShrink: 0,
                      textDecoration: 'none', lineHeight: 1.6,
                    }}
                    title="Buy on ManaPool"
                  >
                    🌊
                  </a>
                  <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
                </div>
              )
            })}
            {hasMore && (
              <button
                onClick={() => setShownCount(n => n + 10)}
                style={{
                  width: '100%', padding: '10px', border: 'none', borderTop: '1px solid var(--border)',
                  background: 'var(--bg-secondary)', color: 'var(--accent-teal)',
                  cursor: 'pointer', fontSize: '.76rem', fontWeight: 600,
                  transition: 'background .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
              >
                Show 10 more ({cards.length - shownCount} remaining)
              </button>
            )}
            <div style={{ padding: '8px 12px', fontSize: '.62rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              Base print · Non-foil · Tap a card to look it up
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard({ matches, collection, wishlist, openLogMatch, setPage, onStartTutorial }) {
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

  // ── Market movers state ──────────────────────────────────────────────────
  const [marketMovers, setMarketMovers] = useState({ gainers: [], losers: [], daysApart: 0, ready: false })
  const [moversLoading, setMoversLoading] = useState(true)
  const [moverSort,    setMoverSort]    = useState('dollar')   // 'dollar' | 'pct'
  const [moverFormat,  setMoverFormat]  = useState(null)       // null | 'standard' | 'pioneer' | ...
  const [moverCard,    setMoverCard]    = useState(null)       // card name to preview
  const [gainersShown, setGainersShown] = useState(5)
  const [losersShown,  setLosersShown]  = useState(5)

  // Reset visible counts whenever sort or format filter changes
  useEffect(() => { setGainersShown(5); setLosersShown(5) }, [moverSort, moverFormat])

  // Read pre-computed movers from Supabase on mount
  useEffect(() => {
    fetchMarketMovers()
      .then(data => setMarketMovers(data))
      .finally(() => setMoversLoading(false))
  }, [])

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
          <img
            src={logoPng}
            alt="Vaulted Singles"
            style={{
              width: '72px', height: 'auto', flexShrink: 0,
              filter: 'invert(1) sepia(0.6) saturate(4) hue-rotate(10deg)',
              mixBlendMode: 'screen',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Scan a card to start building your vault.</div>
          </div>
          <button onClick={() => setPage?.('collection')} style={{ padding: '6px 14px', borderRadius: '99px', background: 'var(--accent-gold)', color: '#1a1000', border: 'none', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', flexShrink: 0 }}>
            + Add
          </button>
        </div>
      )}

      {/* ── Wishlist alert badge ── */}
      {(() => {
        const wl = wishlist || []
        const hits = wl.filter(i => i.targetPrice != null && i.currentPrice != null && i.currentPrice <= i.targetPrice)
        if (hits.length === 0) return null
        return (
          <div
            onClick={() => setPage?.('wishlist')}
            style={{
              margin: '12px 16px 0', cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(62,207,178,.12), rgba(62,207,178,.06))',
              border: '1px solid rgba(62,207,178,.35)',
              borderRadius: '12px', padding: '11px 14px',
              display: 'flex', alignItems: 'center', gap: '10px',
              transition: 'border-color .15s, background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(62,207,178,.6)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(62,207,178,.35)'}
          >
            <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>🎯</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--accent-teal)' }}>
                {hits.length} wishlist card{hits.length > 1 ? 's' : ''} at or below target price!
              </div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hits.map(h => h.name).join(', ')}
              </div>
            </div>
            <span style={{ fontSize: '.75rem', color: 'var(--accent-teal)', flexShrink: 0 }}>View →</span>
          </div>
        )
      })()}

      {/* ── Portfolio Value (compact horizontal layout) ── */}
      <div className="card" style={{ margin: '12px 16px 0', padding: '14px 16px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '0 0 14px' }}>
          {/* Main value */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', marginBottom: 4 }}>Collection Value</div>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#f5f5f5', lineHeight: 1, letterSpacing: '-.5px' }}>${fmt(totalMid)}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 5 }}>{totalCards} card{totalCards !== 1 ? 's' : ''}</div>
          </div>
          {/* Deltas + link */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <button onClick={() => setPage?.('collection')} style={{ fontSize: '.7rem', color: 'var(--accent-teal)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View All →</button>
            <div style={{ display: 'flex', gap: 10 }}>
              {delta7d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>7d</div>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: delta7d.chg >= 0 ? '#4ade80' : '#f87171' }}>
                    {delta7d.chg >= 0 ? '+' : ''}{delta7d.pct}%
                  </div>
                </div>
              )}
              {delta30d != null && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>30d</div>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: delta30d.chg >= 0 ? '#4ade80' : '#f87171' }}>
                    {delta30d.chg >= 0 ? '+' : ''}{delta30d.pct}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Low / Mid / High strip */}
        {collection.length > 0 && (
          <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
            {[['Low', totalMid * 0.80], ['Mid', totalMid], ['High', totalMid * 1.25]].map(([label, val]) => (
              <div key={label} style={{ flex: 1, padding: '8px 8px', textAlign: 'center', borderRight: label !== 'High' ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
                <div style={{ fontSize: '.8rem', fontWeight: 700, color: label === 'Mid' ? 'var(--accent-teal)' : 'var(--text-secondary)', marginTop: '2px' }}>${fmt(val)}</div>
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

      {/* ── Market Movers ── */}
      {(() => {
        const { gainers: allGainers, losers: allLosers, ready, daysApart } = marketMovers

        const FORMATS = [
          { id: 'standard',  label: 'Standard'  },
          { id: 'pioneer',   label: 'Pioneer'   },
          { id: 'modern',    label: 'Modern'    },
          { id: 'legacy',    label: 'Legacy'    },
          { id: 'pauper',    label: 'Pauper'    },
          { id: 'premodern', label: 'Premodern' },
        ]

        const fmtFilter = (list) => {
          if (!moverFormat) return list
          return list.filter(item =>
            !item.legalities || item.legalities[moverFormat] === 'legal'
          )
        }

        const allSortedGainers = fmtFilter([...allGainers])
          .sort(moverSort === 'pct'
            ? (a, b) => b.pctChange    - a.pctChange
            : (a, b) => b.dollarChange - a.dollarChange)

        const allSortedLosers = fmtFilter([...allLosers])
          .sort(moverSort === 'pct'
            ? (a, b) => a.pctChange    - b.pctChange
            : (a, b) => a.dollarChange - b.dollarChange)

        const sortedGainers      = allSortedGainers.slice(0, gainersShown)
        const sortedLosers       = allSortedLosers.slice(0, losersShown)
        const moreGainersCount   = Math.max(0, allSortedGainers.length - gainersShown)
        const moreLosersCount    = Math.max(0, allSortedLosers.length  - losersShown)

        const showMoreBtnStyle = (color) => ({
          marginTop: 10, width: '100%',
          padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${color}40`,
          background: `${color}14`,
          color, fontSize: '.7rem', fontWeight: 700,
          transition: 'background .15s',
        })

        const chipStyle = (active) => ({
          padding: '3px 10px', borderRadius: 99, fontSize: '.64rem', fontWeight: 700,
          background:  active ? 'var(--accent-gold-glow)' : 'transparent',
          border:      `1px solid ${active ? 'var(--accent-gold)' : 'var(--border)'}`,
          color:       active ? 'var(--accent-gold)' : 'var(--text-muted)',
          cursor: 'pointer', transition: 'all .15s',
        })

        return (
          <div style={{ margin: '12px 16px 0' }}>
            {/* Section header + sort toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <div className="section-title" style={{ padding: 0 }}>Market Movers</div>
                {ready && daysApart > 0 && (
                  <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{daysApart}d change</span>
                )}
              </div>
              {ready && (
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={() => setMoverSort('dollar')} style={chipStyle(moverSort === 'dollar')}>$ Amount</button>
                  <button onClick={() => setMoverSort('pct')}    style={chipStyle(moverSort === 'pct')}>% Change</button>
                </div>
              )}
            </div>

            {/* Format filter row */}
            {ready && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                <button onClick={() => setMoverFormat(null)} style={chipStyle(!moverFormat)}>All</button>
                {FORMATS.map(f => (
                  <button key={f.id} onClick={() => setMoverFormat(moverFormat === f.id ? null : f.id)} style={chipStyle(moverFormat === f.id)}>
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {moversLoading ? (
              <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Loading market data…</div>
              </div>

            ) : !ready ? (
              <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>📊</div>
                <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Building market history
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                  The market tracker runs daily — movers appear after 8 days of snapshots.
                </div>
              </div>

            ) : (
              <div className="grid-2">
                {/* Gainers */}
                <div className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-green)', marginBottom: '10px' }}>▲ Gainers</div>
                  {sortedGainers.length === 0
                    ? <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>No notable gainers{moverFormat ? ` in ${moverFormat}` : ''}</div>
                    : sortedGainers.map(g => <MoverRow key={g.name} item={g} type="gain" sort={moverSort} onClick={() => setMoverCard(g.name)} />)
                  }
                  {moreGainersCount > 0 && (
                    <button
                      onClick={() => setGainersShown(n => n + 5)}
                      style={showMoreBtnStyle('#4ade80')}
                    >
                      Show {Math.min(5, moreGainersCount)} more ({moreGainersCount} remaining)
                    </button>
                  )}
                </div>
                {/* Losers */}
                <div className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--accent-red)', marginBottom: '10px' }}>▼ Losers</div>
                  {sortedLosers.length === 0
                    ? <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>No notable losers{moverFormat ? ` in ${moverFormat}` : ''}</div>
                    : sortedLosers.map(l => <MoverRow key={l.name} item={l} type="loss" sort={moverSort} onClick={() => setMoverCard(l.name)} />)
                  }
                  {moreLosersCount > 0 && (
                    <button
                      onClick={() => setLosersShown(n => n + 5)}
                      style={showMoreBtnStyle('#f87171')}
                    >
                      Show {Math.min(5, moreLosersCount)} more ({moreLosersCount} remaining)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Mover card preview modal ── */}
      {moverCard && <MoverCardModal name={moverCard} onClose={() => setMoverCard(null)} setPage={setPage} />}

      {/* ── Tournament Demand ── */}
      <TournamentWidget collection={collection} setPage={setPage} />

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

      {/* ── Restart tutorial ── */}
      <div style={{ textAlign: 'center', padding: '28px 16px 8px' }}>
        <button
          onClick={onStartTutorial}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '.75rem', color: 'var(--text-muted)',
            textDecoration: 'underline', textDecorationStyle: 'dotted',
            textUnderlineOffset: '3px',
          }}
        >
          🧭 Restart app tour
        </button>
      </div>

    </div>
  )
}

function MoverRow({ item, type, sort = 'dollar', onClick }) {
  const isGain   = type === 'gain'
  const color    = isGain ? 'var(--accent-green)' : 'var(--accent-red)'
  const primary  = sort === 'pct'
    ? `${isGain ? '+' : ''}${item.pctChange}%`
    : `${item.dollarChange > 0 ? '+' : '-'}$${Math.abs(item.dollarChange).toFixed(2)}`
  const secondary = sort === 'pct'
    ? `${item.dollarChange > 0 ? '+' : '-'}$${Math.abs(item.dollarChange).toFixed(2)}`
    : `${isGain ? '+' : ''}${item.pctChange}%`
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'pointer', borderRadius: 6, transition: 'background .12s',
      }}
      className="mover-row-last-no-border"
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {item.img
        ? <img src={item.img} alt={item.name} style={{ width: '28px', borderRadius: '3px', flexShrink: 0 }} />
        : <div style={{ width: '28px', height: '40px', background: 'var(--bg-hover)', borderRadius: '3px', flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
        <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: '1px' }}>${item.oldPrice.toFixed(2)} → ${item.newPrice.toFixed(2)}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '.82rem', fontWeight: 800, color }}>{primary}</div>
        <div style={{ fontSize: '.62rem', color, opacity: .7, marginTop: '1px' }}>{secondary}</div>
      </div>
    </div>
  )
}

function MoverCardModal({ name, onClose, setPage }) {
  const [card,    setCard]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setCard(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [name])

  const face     = card?.card_faces?.[0] || card
  const img      = card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal
  const oracle   = face?.oracle_text || ''
  const typeLine = face?.type_line   || card?.type_line || ''
  const manaCost = face?.mana_cost   || card?.mana_cost || ''
  const flavor   = face?.flavor_text || ''
  const usd     = card?.prices?.usd
  const usdFoil = card?.prices?.usd_foil
  const setName = card?.set_name

  const FORMAT_LABELS = {
    standard: 'Standard', pioneer: 'Pioneer', modern: 'Modern',
    legacy: 'Legacy', pauper: 'Pauper', premodern: 'Premodern',
  }
  const legalFormats = card?.legalities
    ? Object.entries(FORMAT_LABELS)
        .filter(([k]) => card.legalities[k] === 'legal')
        .map(([, v]) => v)
    : []

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 501, padding: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,.7)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '50%',
          width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: '.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
            Loading…
          </div>
        ) : !card ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
            Card not found
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {/* Image */}
            <div style={{ flexShrink: 0 }}>
              {img
                ? <img src={img} alt={name} style={{ width: 'min(200px,40vw)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,.6)', display: 'block' }} />
                : <div style={{ width: 'min(200px,40vw)', aspectRatio: '63/88', background: 'var(--bg-card)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🃏</div>
              }
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.25, paddingRight: 32 }}>{name}</div>
                {typeLine && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{typeLine}</div>}
                {manaCost && <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{manaCost}</div>}
                {setName  && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{setName}</div>}
              </div>

              {oracle && (
                <div style={{ fontSize: '.75rem', color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  {oracle}
                </div>
              )}
              {flavor && (
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>"{flavor}"</div>
              )}

              {/* Prices */}
              <div style={{ display: 'flex', gap: 10 }}>
                {usd ? (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.25)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>MARKET</div>
                    <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--accent-gold)' }}>${usd}</div>
                  </div>
                ) : (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>MARKET</div>
                    <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-muted)' }}>—</div>
                  </div>
                )}
                {usdFoil && (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(201,168,76,.06)', border: '1px solid rgba(201,168,76,.15)' }}>
                    <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>FOIL</div>
                    <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--accent-gold)', opacity: .8 }}>${usdFoil}</div>
                  </div>
                )}
              </div>

              {/* Legal formats */}
              {legalFormats.length > 0 && (
                <div>
                  <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>Legal in</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {legalFormats.map(f => (
                      <span key={f} style={{ fontSize: '.62rem', padding: '2px 7px', borderRadius: 99, background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.25)', color: '#4ade80', fontWeight: 600 }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  window.__lookupCardName = name
                  window.dispatchEvent(new CustomEvent('vaulted:lookup-card', { detail: { name } }))
                  setPage?.('cards')
                  onClose()
                }}
                style={{
                  marginTop: 4, padding: '9px 16px', borderRadius: 9, border: 'none',
                  background: 'var(--accent-gold)', color: '#000',
                  fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', alignSelf: 'flex-start',
                }}
              >
                View in Card Lookup →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

