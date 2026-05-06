import { useState, useEffect, useCallback } from 'react'

// ── Config ─────────────────────────────────────────────────────────────────

const FORMATS = [
  { id: 'modern',   label: 'Modern'   },
  { id: 'standard', label: 'Standard' },
  { id: 'pioneer',  label: 'Pioneer'  },
  { id: 'legacy',   label: 'Legacy'   },
  { id: 'pauper',   label: 'Pauper'   },
  { id: 'vintage',  label: 'Vintage'  },
]

const WINDOWS = [
  { id: '2weeks',  label: 'Last 2 Weeks' },
  { id: 'month',   label: 'Last Month'   },
  { id: 'alltime', label: 'All Time'     },
]

const CAT_STYLE = {
  'AGGRO':       { border: '#ef4444', bg: 'rgba(127,29,29,0.30)',  text: '#fca5a5', emoji: '⚔️'  },
  'CONTROL':     { border: '#3b82f6', bg: 'rgba(30,58,138,0.30)', text: '#93c5fd', emoji: '🛡️'  },
  'COMBO':       { border: '#a855f7', bg: 'rgba(88,28,135,0.30)', text: '#d8b4fe', emoji: '⚡'  },
  'AGGRO-COMBO': { border: '#f97316', bg: 'rgba(124,45,18,0.30)', text: '#fdba74', emoji: '💥'  },
  'MIDRANGE':    { border: '#10b981', bg: 'rgba(6,78,59,0.30)',   text: '#6ee7b7', emoji: '🌲'  },
  'RAMP':        { border: '#22c55e', bg: 'rgba(20,83,45,0.30)',  text: '#86efac', emoji: '🔺'  },
  'TEMPO':       { border: '#0ea5e9', bg: 'rgba(12,74,110,0.30)', text: '#7dd3fc', emoji: '💨'  },
  'PRISON':      { border: '#78716c', bg: 'rgba(28,25,23,0.30)',  text: '#d6d3d1', emoji: '🔒'  },
  'HYBRID':      { border: '#e879f9', bg: 'rgba(112,26,117,0.30)',text: '#f0abfc', emoji: '🔀'  },
  'OTHER':       { border: '#6b7280', bg: 'rgba(31,41,55,0.30)',  text: '#d1d5db', emoji: '📦'  },
}
const DEFAULT_CAT_STYLE = CAT_STYLE['OTHER']
function catStyle(name) { return CAT_STYLE[name] || DEFAULT_CAT_STYLE }

// Module-level cache so Scryfall art isn't re-fetched when switching formats
const scryfallArtCache = {}

// ── Sub-components ─────────────────────────────────────────────────────────

function TrendArrow({ trend }) {
  if (trend === 'up')   return <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1rem' }}>↑</span>
  if (trend === 'down') return <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '1rem' }}>↓</span>
  return <span style={{ color: '#475569', fontSize: '1rem' }}>→</span>
}

// Fetches Scryfall art_crop for curated archetypes (no MTGTop8 ID available)
function ScryfallThumb({ cardName, altText }) {
  const [artUrl,  setArtUrl]  = useState(scryfallArtCache[cardName] ?? null)
  const [loading, setLoading] = useState(!scryfallArtCache[cardName] && !!cardName)
  const [err,     setErr]     = useState(false)

  useEffect(() => {
    if (!cardName || scryfallArtCache[cardName] !== undefined) return
    let cancelled = false
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const url = d.image_uris?.art_crop
          || d.card_faces?.[0]?.image_uris?.art_crop
          || null
        scryfallArtCache[cardName] = url || false
        if (url) setArtUrl(url)
        else     setErr(true)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        scryfallArtCache[cardName] = false
        setErr(true)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [cardName])

  const box = {
    width: 72, height: 100, borderRadius: 6, flexShrink: 0,
    overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)',
  }

  if (loading) {
    return <div style={{ ...box, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
  }
  if (err || !artUrl) {
    return (
      <div style={{ ...box, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
        🃏
      </div>
    )
  }
  return (
    <img
      src={artUrl}
      alt={altText}
      style={{ ...box, objectFit: 'cover', objectPosition: 'center top' }}
    />
  )
}

// MTGTop8 CDN thumbnail (live data only – uses numeric ID)
function MTGTop8Thumb({ id, name }) {
  const [err, setErr] = useState(false)
  const box = { width: 72, height: 100, borderRadius: 6, flexShrink: 0, border: '1px solid rgba(255,255,255,0.10)' }
  if (err) {
    return <div style={{ ...box, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🃏</div>
  }
  return (
    <img
      src={`https://www.mtgtop8.com/metas_thumbs/${id}.jpg`}
      alt={name}
      onError={() => setErr(true)}
      style={{ ...box, objectFit: 'cover' }}
    />
  )
}

// Picks the right thumbnail component based on data source
function ArchetypeThumb({ arch, source }) {
  if (source === 'live' && arch.id) {
    return <MTGTop8Thumb id={arch.id} name={arch.name} />
  }
  return <ScryfallThumb cardName={arch.keyCard} altText={arch.name} />
}

// Single archetype card
function ArchetypeCard({ arch, source }) {
  const inner = (
    <div
      style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.07)',
        cursor: arch.id ? 'pointer' : 'default',
        transition: 'background 0.15s, border-color 0.15s',
        height: '100%',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
    >
      <ArchetypeThumb arch={arch} source={source} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          color: '#60a5fa', fontWeight: 600, fontSize: '0.82rem',
          lineHeight: 1.3, marginBottom: 6,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {arch.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {arch.pct != null && (
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.5px' }}>
              {arch.pct}%
              {source === 'curated' && (
                <span style={{ fontSize: '0.6rem', color: '#64748b', marginLeft: 2 }}>~</span>
              )}
            </span>
          )}
          <TrendArrow trend={arch.trend} />
        </div>
      </div>
    </div>
  )

  if (arch.id) {
    return (
      <a href={`https://www.mtgtop8.com/archetype?a=${arch.id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    )
  }
  return <div>{inner}</div>
}

// Category section
function CategorySection({ cat, source }) {
  const s = catStyle(cat.name)
  return (
    <div style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: `1px solid ${s.border}44` }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px',
        background: s.bg,
        borderBottom: `1px solid ${s.border}44`,
      }}>
        <span style={{ fontSize: '1rem' }}>{s.emoji}</span>
        <span style={{ color: s.text, fontWeight: 700, fontSize: '0.88rem', letterSpacing: '0.08em' }}>
          {cat.name}
        </span>
        {cat.pct != null && (
          <span style={{
            marginLeft: 'auto',
            background: s.border + '33', color: s.text,
            fontWeight: 700, fontSize: '0.85rem',
            padding: '2px 10px', borderRadius: 20,
            border: `1px solid ${s.border}66`,
          }}>
            {cat.pct}%
          </span>
        )}
      </div>

      <div style={{
        padding: 12, background: 'rgba(0,0,0,0.2)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: 10,
      }}>
        {cat.archetypes.map(arch => (
          <ArchetypeCard key={arch.id || arch.name} arch={arch} source={source} />
        ))}
      </div>
    </div>
  )
}

// ── Spike Predictor sub-component ──────────────────────────────────────────

const SIGNAL_STYLE = {
  buy:      { bg: 'rgba(34,197,94,.12)',  border: '#22c55e44', text: '#4ade80', label: '🚀 Buy Window',  dot: '#22c55e' },
  watch:    { bg: 'rgba(251,191,36,.10)', border: '#fbbf2444', text: '#fbbf24', label: '👀 Watch',       dot: '#fbbf24' },
  dropping: { bg: 'rgba(239,68,68,.10)',  border: '#ef444444', text: '#f87171', label: '📉 Dropping',    dot: '#ef4444' },
}

function SpikeCard({ spike }) {
  const s        = SIGNAL_STYLE[spike.signal] || SIGNAL_STYLE.watch
  const pctUp    = spike.pct_delta > 0
  const priceUp  = spike.price_delta != null && spike.price_delta > 0
  const tcgLink  = `https://partner.tcgplayer.com/c/7200332/1780961/21018?u=${encodeURIComponent(`https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(spike.card_name)}`)}`

  return (
    <div style={{
      background: s.bg,
      border:     `1px solid ${s.border}`,
      borderRadius: 10,
      padding:    '12px 14px',
      display:    'flex',
      flexDirection: 'column',
      gap:        8,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#f1f5f9', lineHeight: 1.2 }}>
            {spike.card_name}
          </div>
          <div style={{ fontSize: '.68rem', color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {spike.format}
          </div>
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: '.65rem', fontWeight: 700, letterSpacing: '.06em',
          color: s.text, background: s.bg,
          border: `1px solid ${s.border}`,
          borderRadius: 20, padding: '2px 8px',
        }}>
          {s.label}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12 }}>
        {/* Play rate */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.62rem', color: '#64748b', marginBottom: 2 }}>Play Rate</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '.95rem', fontWeight: 700, color: '#f8fafc' }}>
              {spike.pct_now}%
            </span>
            <span style={{ fontSize: '.72rem', color: pctUp ? '#4ade80' : '#f87171', fontWeight: 600 }}>
              {pctUp ? '▲' : '▼'}{Math.abs(spike.pct_delta)}pp
            </span>
          </div>
          <div style={{ fontSize: '.62rem', color: '#475569' }}>was {spike.pct_prev}%</div>
        </div>

        {/* Price */}
        {spike.price_now != null && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.62rem', color: '#64748b', marginBottom: 2 }}>Price</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: '.95rem', fontWeight: 700, color: '#f8fafc' }}>
                ${spike.price_now.toFixed(2)}
              </span>
              {spike.price_delta != null && (
                <span style={{ fontSize: '.72rem', color: priceUp ? '#fb923c' : '#4ade80', fontWeight: 600 }}>
                  {priceUp ? '▲' : '▼'}${Math.abs(spike.price_delta).toFixed(2)}
                </span>
              )}
            </div>
            {spike.price_prev != null && (
              <div style={{ fontSize: '.62rem', color: '#475569' }}>was ${spike.price_prev.toFixed(2)}</div>
            )}
          </div>
        )}
      </div>

      {/* Buy link */}
      {spike.signal !== 'dropping' && (
        <a
          href={tcgLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block', textAlign: 'center',
            background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.2)',
            borderRadius: 6, padding: '5px 0',
            color: '#4ade80', fontWeight: 700, fontSize: '.72rem',
            textDecoration: 'none',
          }}
        >
          🛒 Buy on TCGPlayer
        </a>
      )}
    </div>
  )
}

function SpikePredictor() {
  const [spikeFormat,   setSpikeFormat]   = useState('all')
  const [spikeData,     setSpikeData]     = useState(null)
  const [spikeLoading,  setSpikeLoading]  = useState(false)
  const [spikeError,    setSpikeError]    = useState(null)

  const fetchSpikes = useCallback(async (fmt) => {
    setSpikeLoading(true)
    setSpikeError(null)
    try {
      const res  = await fetch(`/.netlify/functions/spike-predictor?format=${fmt}&limit=40`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setSpikeData(json)
    } catch (e) {
      setSpikeError(e.message)
    } finally {
      setSpikeLoading(false)
    }
  }, [])

  useEffect(() => { fetchSpikes(spikeFormat) }, [spikeFormat, fetchSpikes])

  const buys     = spikeData?.spikes?.filter(s => s.signal === 'buy')     || []
  const watches  = spikeData?.spikes?.filter(s => s.signal === 'watch')   || []
  const dropping = spikeData?.spikes?.filter(s => s.signal === 'dropping') || []

  return (
    <div>
      {/* Format filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {[{ id: 'all', label: 'All Formats' }, ...FORMATS].map(f => (
          <button key={f.id} onClick={() => setSpikeFormat(f.id)} style={{
            flexShrink: 0, padding: '6px 14px', borderRadius: 20,
            border: spikeFormat === f.id ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.12)',
            background: spikeFormat === f.id ? 'rgba(34,197,94,.15)' : 'rgba(255,255,255,0.05)',
            color: spikeFormat === f.id ? '#4ade80' : '#94a3b8',
            fontWeight: spikeFormat === f.id ? 700 : 500,
            fontSize: '0.80rem', cursor: 'pointer',
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {spikeLoading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4ade80' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📈</div>
          <div style={{ fontWeight: 600 }}>Analysing play rate trends…</div>
        </div>
      )}

      {!spikeLoading && spikeError && (
        <div style={{ borderRadius: 10, padding: 20, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', textAlign: 'center' }}>
          <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: 8 }}>⚠️ {spikeError}</div>
          <button onClick={() => fetchSpikes(spikeFormat)} style={{ padding: '7px 18px', borderRadius: 8, background: '#1d4ed8', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.82rem' }}>
            Retry
          </button>
        </div>
      )}

      {!spikeLoading && !spikeError && spikeData?.noData && (
        <div style={{ borderRadius: 10, padding: '32px 20px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.2)', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🌱</div>
          <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 6 }}>Building the dataset</div>
          <div style={{ color: '#92400e', fontSize: '.82rem', maxWidth: 340, margin: '0 auto' }}>
            The spike predictor needs at least two weekly snapshots to compare. Check back after the first Sunday snapshot runs, or trigger <code style={{ color: '#fbbf24' }}>ingest-meta</code> manually in Netlify.
          </div>
        </div>
      )}

      {!spikeLoading && !spikeError && spikeData && !spikeData.noData && (
        <>
          <div style={{ fontSize: '.72rem', color: '#475569', marginBottom: 14 }}>
            Week of {spikeData.week} vs {spikeData.prevWeek} · {spikeData.total} signal{spikeData.total !== 1 ? 's' : ''} detected
          </div>

          {buys.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#4ade80', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                🚀 Buy Window — Play rate rising, price hasn't moved yet
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {buys.map(s => <SpikeCard key={`${s.card_name}|${s.format}`} spike={s} />)}
              </div>
            </div>
          )}

          {watches.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                👀 Watch — Trending up, price starting to follow
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {watches.map(s => <SpikeCard key={`${s.card_name}|${s.format}`} spike={s} />)}
              </div>
            </div>
          )}

          {dropping.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#f87171', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                📉 Dropping — Play rate declining
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {dropping.map(s => <SpikeCard key={`${s.card_name}|${s.format}`} spike={s} />)}
              </div>
            </div>
          )}

          {buys.length === 0 && watches.length === 0 && dropping.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
              No significant movements this week.
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function MetaTracker() {
  const [activeTab,   setActiveTab]   = useState('meta')   // 'meta' | 'spikes'
  const [format,      setFormat]      = useState('modern')
  const [timeWindow,  setTimeWindow]  = useState('2weeks')
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [lastFetched, setLastFetched] = useState(null)

  const fetchMeta = useCallback(async (fmt, win) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/.netlify/functions/metagame?format=${fmt}&window=${win}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json)
      setLastFetched(new Date())
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMeta(format, timeWindow) }, [format, timeWindow, fetchMeta])

  const isLive    = data?.source === 'live'
  const isCurated = data?.source === 'curated'

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── Banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #2563eb 100%)',
        borderRadius: 12,
        padding: '18px 20px 16px',
        marginBottom: 16,
        boxShadow: '0 4px 20px rgba(37,99,235,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            {/* source badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em',
                color: isLive ? '#4ade80' : isCurated ? '#fbbf24' : '#93c5fd',
                textTransform: 'uppercase',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isLive ? '#4ade80' : isCurated ? '#fbbf24' : '#94a3b8',
                  display: 'inline-block',
                  boxShadow: isLive ? '0 0 6px #4ade80' : isCurated ? '0 0 6px #fbbf24' : 'none',
                }} />
                {isLive ? 'Live · MTGTop8.com' : isCurated ? 'Community Estimates' : 'Loading…'}
              </div>
            </div>

            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Metagame Breakdown
            </div>

            {data?.totalDecks && (
              <div style={{ fontSize: '0.78rem', color: '#bfdbfe', marginTop: 4 }}>
                {data.totalDecks.toLocaleString()} decks analysed
                {isCurated && <span style={{ color: '#fbbf24', marginLeft: 6 }}>(estimated)</span>}
              </div>
            )}
            {lastFetched && !loading && (
              <div style={{ fontSize: '0.7rem', color: '#93c5fd', marginTop: 4 }}>
                Updated {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => fetchMeta(format, timeWindow)}
            disabled={loading}
            style={{
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: loading ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem', fontWeight: 600, transition: 'background 0.15s',
            }}
          >
            <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Main tab switcher ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'meta',   label: '⚔️ Metagame' },
          { id: 'spikes', label: '📈 Spike Predictor' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '8px 18px', borderRadius: 20,
            border: activeTab === t.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.12)',
            background: activeTab === t.id ? '#1d4ed8' : 'rgba(255,255,255,0.05)',
            color: activeTab === t.id ? '#fff' : '#94a3b8',
            fontWeight: activeTab === t.id ? 700 : 500,
            fontSize: '0.84rem', cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Spike Predictor tab ── */}
      {activeTab === 'spikes' && <SpikePredictor />}

      {/* ── Metagame tab ── */}
      {activeTab === 'meta' && <>

      {/* ── Format tabs ── */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12,
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        {FORMATS.map(f => (
          <button key={f.id} onClick={() => setFormat(f.id)} style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 20,
            border: format === f.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.12)',
            background: format === f.id ? '#1d4ed8' : 'rgba(255,255,255,0.05)',
            color: format === f.id ? '#fff' : '#94a3b8',
            fontWeight: format === f.id ? 700 : 500,
            fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Time window chips ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {WINDOWS.map(w => (
          <button key={w.id} onClick={() => setTimeWindow(w.id)} style={{
            padding: '5px 12px', borderRadius: 16,
            border: timeWindow === w.id ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
            background: timeWindow === w.id ? 'rgba(245,158,11,0.15)' : 'transparent',
            color: timeWindow === w.id ? '#f59e0b' : '#64748b',
            fontWeight: timeWindow === w.id ? 600 : 400,
            fontSize: '0.76rem', cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {w.label}
          </button>
        ))}
      </div>

      {/* ── Body ── */}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 14 }}>
          <div style={{ fontSize: 36 }}>⚔️</div>
          <div style={{ color: '#60a5fa', fontWeight: 600 }}>Loading metagame data…</div>
        </div>
      )}

      {!loading && error && (
        <div style={{ borderRadius: 12, padding: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: 16 }}>Could not load metagame data</div>
          <button onClick={() => fetchMeta(format, timeWindow)} style={{ padding: '8px 20px', borderRadius: 8, background: '#1d4ed8', border: 'none', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
            🔄 Try Again
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Category summary chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {data.categories.map(cat => {
              const s = catStyle(cat.name)
              return (
                <div key={cat.name} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 20,
                  background: s.bg, border: `1px solid ${s.border}55`,
                  fontSize: '0.76rem',
                }}>
                  <span>{s.emoji}</span>
                  <span style={{ color: s.text, fontWeight: 600 }}>{cat.name}</span>
                  {cat.pct != null && <span style={{ color: s.text, fontWeight: 700 }}>{cat.pct}%</span>}
                </div>
              )
            })}
          </div>

          {/* Category sections */}
          {data.categories.map(cat => (
            <CategorySection key={cat.name} cat={cat} source={data.source} />
          ))}

          {/* Footer note for curated data */}
          {isCurated && (
            <div style={{
              marginTop: 4, padding: '12px 16px',
              borderRadius: 8, border: '1px solid rgba(251,191,36,0.2)',
              background: 'rgba(251,191,36,0.06)',
              fontSize: '0.75rem', color: '#92400e',
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>ℹ️</span>
              <span style={{ color: '#fbbf24' }}>
                These are community estimates — live data from MTGTop8 is unavailable right now (their site blocks automated requests).
                Hit <strong>Refresh</strong> to try again, or{' '}
                <a href="https://www.mtgtop8.com" target="_blank" rel="noopener noreferrer" style={{ color: '#f59e0b' }}>
                  visit MTGTop8 directly ↗
                </a>
              </span>
            </div>
          )}

          {isLive && (
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: '0.7rem', color: '#334155' }}>
              Data from{' '}
              <a href="https://www.mtgtop8.com" target="_blank" rel="noopener noreferrer" style={{ color: '#475569', textDecoration: 'underline' }}>
                MTGTop8.com
              </a>
            </div>
          )}
        </>
      )}

      {/* close metagame tab wrapper */}
      </>}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
      `}</style>
    </div>
  )
}
