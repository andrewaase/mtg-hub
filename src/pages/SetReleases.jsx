import { useState, useEffect, useMemo } from 'react'

// ── Helpers ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function daysUntil(dateStr) {
  const release = new Date(dateStr + 'T12:00:00Z')
  const now     = new Date()
  return Math.ceil((release - now) / 86400000)
}

function daysAgo(dateStr) {
  const release = new Date(dateStr + 'T12:00:00Z')
  return Math.floor((Date.now() - release) / 86400000)
}

// ── Set type metadata ──────────────────────────────────────────────────────

const TYPE_META = {
  expansion:        { label: 'Expansion',    color: '#3b82f6', bg: 'rgba(59,130,246,0.15)'  },
  core:             { label: 'Core Set',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
  masters:          { label: 'Masters',      color: '#a855f7', bg: 'rgba(168,85,247,0.15)'  },
  draft_innovation: { label: 'Innovation',   color: '#14b8a6', bg: 'rgba(20,184,166,0.15)'  },
  commander:        { label: 'Commander',    color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
  planechase:       { label: 'Planechase',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)'  },
  archenemy:        { label: 'Archenemy',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)'   },
  duel_deck:        { label: 'Duel Deck',    color: '#6366f1', bg: 'rgba(99,102,241,0.15)'  },
  starter:          { label: 'Starter',      color: '#06b6d4', bg: 'rgba(6,182,212,0.15)'   },
  box:              { label: 'Box Set',      color: '#84cc16', bg: 'rgba(132,204,22,0.15)'  },
  funny:            { label: 'Un-Set',       color: '#ec4899', bg: 'rgba(236,72,153,0.15)'  },
  masterpiece:      { label: 'Masterpiece',  color: '#f97316', bg: 'rgba(249,115,22,0.15)'  },
  from_the_vault:   { label: 'From the Vault', color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  premium_deck:     { label: 'Premium Deck', color: '#64748b', bg: 'rgba(100,116,139,0.15)' },
}
function typeMeta(type) {
  return TYPE_META[type] || { label: type, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' }
}

// Filter tab definitions
const FILTERS = [
  { id: 'all',       label: 'All'         },
  { id: 'expansion', label: 'Expansions'  },
  { id: 'masters',   label: 'Masters'     },
  { id: 'commander', label: 'Commander'   },
]

const EXPANSION_TYPES = new Set(['expansion', 'core', 'draft_innovation', 'starter'])
const MASTERS_TYPES   = new Set(['masters', 'from_the_vault', 'premium_deck', 'masterpiece'])
const COMMANDER_TYPES = new Set(['commander', 'duel_deck', 'planechase', 'archenemy', 'box'])
// Exclude digital, tokens, promo-only
const EXCLUDE_TYPES   = new Set(['token', 'memorabilia', 'minigame', 'treasure_chest', 'promo'])

// ── Set icon component ─────────────────────────────────────────────────────

function SetIcon({ uri, size = 28 }) {
  const [err, setErr] = useState(false)
  if (err || !uri) {
    return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>🃏</span>
  }
  return (
    <img
      src={uri}
      alt=""
      onError={() => setErr(true)}
      style={{
        width: size, height: size,
        objectFit: 'contain',
        filter: 'invert(1) opacity(0.75)',
        flexShrink: 0,
      }}
    />
  )
}

// ── Single set card ────────────────────────────────────────────────────────

function SetCard({ set, showCountdown = false }) {
  const tm      = typeMeta(set.set_type)
  const days    = showCountdown ? daysUntil(set.released_at) : null
  const ago     = !showCountdown ? daysAgo(set.released_at) : null
  const scryfallUrl = `https://scryfall.com/sets/${set.code}`

  return (
    <a
      href={scryfallUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          display: 'flex', gap: 14, alignItems: 'center',
          padding: '13px 15px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10,
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
      >
        {/* Set symbol */}
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <SetIcon uri={set.icon_svg_uri} size={24} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '0.88rem', color: '#f1f5f9',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 3,
          }}>
            {set.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {set.code.toUpperCase()}
            </span>
            <span style={{ color: '#334155', fontSize: '0.7rem' }}>·</span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {fmtDate(set.released_at)}
            </span>
            {set.card_count > 0 && !showCountdown && (
              <>
                <span style={{ color: '#334155', fontSize: '0.7rem' }}>·</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {set.card_count} cards
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right side: countdown / days ago + type badge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
          {showCountdown && days !== null && (
            <div style={{
              padding: '3px 10px', borderRadius: 20,
              background: days <= 14 ? 'rgba(34,197,94,0.15)' : days <= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.12)',
              border: `1px solid ${days <= 14 ? 'rgba(34,197,94,0.3)' : days <= 60 ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.25)'}`,
              color: days <= 14 ? '#4ade80' : days <= 60 ? '#fbbf24' : '#93c5fd',
              fontSize: '0.75rem', fontWeight: 700,
            }}>
              {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d`}
            </div>
          )}
          {!showCountdown && ago !== null && ago <= 30 && (
            <div style={{
              padding: '3px 10px', borderRadius: 20,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
              color: '#4ade80', fontSize: '0.72rem', fontWeight: 600,
            }}>
              NEW
            </div>
          )}
          <div style={{
            padding: '2px 8px', borderRadius: 12,
            background: tm.bg, color: tm.color,
            fontSize: '0.68rem', fontWeight: 600,
            letterSpacing: '0.04em',
            border: `1px solid ${tm.color}33`,
          }}>
            {tm.label}
          </div>
        </div>
      </div>
    </a>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 12,
    }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0' }}>{title}</span>
      {count > 0 && (
        <span style={{
          marginLeft: 4,
          background: 'rgba(255,255,255,0.08)',
          color: '#64748b', fontSize: '0.72rem', fontWeight: 600,
          padding: '1px 8px', borderRadius: 12,
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SetReleases() {
  const [allSets,   setAllSets]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [filter,    setFilter]    = useState('all')
  const [showAll,   setShowAll]   = useState(false)

  useEffect(() => {
    fetch('https://api.scryfall.com/sets')
      .then(r => r.json())
      .then(data => {
        const relevant = (data.data || []).filter(s =>
          !s.digital && !EXCLUDE_TYPES.has(s.set_type)
        )
        setAllSets(relevant)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  // Apply type filter
  const filtered = useMemo(() => {
    if (filter === 'all')       return allSets
    if (filter === 'expansion') return allSets.filter(s => EXPANSION_TYPES.has(s.set_type))
    if (filter === 'masters')   return allSets.filter(s => MASTERS_TYPES.has(s.set_type))
    if (filter === 'commander') return allSets.filter(s => COMMANDER_TYPES.has(s.set_type))
    return allSets
  }, [allSets, filter])

  const upcoming = useMemo(() =>
    filtered.filter(s => s.released_at > TODAY).sort((a, b) => a.released_at.localeCompare(b.released_at)),
    [filtered]
  )

  const recent = useMemo(() =>
    filtered.filter(s => s.released_at <= TODAY).sort((a, b) => b.released_at.localeCompare(a.released_at)),
    [filtered]
  )

  const recentVisible = showAll ? recent : recent.slice(0, 20)

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: 12, padding: '18px 20px 16px', marginBottom: 16,
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
          Powered by Scryfall
        </div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          📅 Set Release Calendar
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
          Upcoming and recent Magic: The Gathering releases
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
            border: filter === f.id ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
            background: filter === f.id ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)',
            color: filter === f.id ? '#f59e0b' : '#64748b',
            fontWeight: filter === f.id ? 700 : 500,
            fontSize: '0.8rem', transition: 'all 0.15s',
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <div style={{ fontWeight: 600, color: '#60a5fa' }}>Loading sets…</div>
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: 24, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
          Failed to load: {error}
        </div>
      )}

      {/* ── Content ── */}
      {!loading && !error && (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <SectionHeader icon="🚀" title="Coming Soon" count={upcoming.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcoming.map(s => <SetCard key={s.code} set={s} showCountdown />)}
              </div>
            </div>
          )}

          {upcoming.length === 0 && (
            <div style={{
              padding: '16px 20px', borderRadius: 10, marginBottom: 28,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              color: '#475569', fontSize: '0.85rem', textAlign: 'center',
            }}>
              No upcoming releases announced yet for this filter.
            </div>
          )}

          {/* Recent */}
          {recent.length > 0 && (
            <div>
              <SectionHeader icon="✅" title="Recently Released" count={recent.length} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentVisible.map(s => <SetCard key={s.code} set={s} />)}
              </div>

              {recent.length > 20 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  style={{
                    marginTop: 12, width: '100%',
                    padding: '10px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#64748b', cursor: 'pointer', fontSize: '0.82rem',
                    transition: 'background 0.15s',
                  }}
                >
                  {showAll ? '▲ Show less' : `▼ Show all ${recent.length} sets`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
