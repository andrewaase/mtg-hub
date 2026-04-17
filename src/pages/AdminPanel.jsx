import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'mtgvaultedsingles@gmail.com'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtRelative(iso) {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso)
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = '#f59e0b' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#475569' }}>{sub}</div>}
    </div>
  )
}

// ── Mini bar chart (signups over 30 days) ──────────────────────────────────

function SignupChart({ signupsByDay }) {
  const entries = Object.entries(signupsByDay || {})
  if (entries.length === 0) return null

  const max = Math.max(1, ...entries.map(([, v]) => v))
  const total = entries.reduce((s, [, v]) => s + v, 0)

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '16px 18px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e2e8f0' }}>
          📈 New Signups — Last 30 Days
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {total} total
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
        {entries.map(([date, count]) => (
          <div
            key={date}
            title={`${date}: ${count} signup${count !== 1 ? 's' : ''}`}
            style={{
              flex: 1,
              height: `${Math.max(4, (count / max) * 100)}%`,
              background: count > 0 ? '#3b82f6' : 'rgba(255,255,255,0.06)',
              borderRadius: '2px 2px 0 0',
              transition: 'height 0.3s',
              cursor: 'default',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.62rem', color: '#334155' }}>
        <span>{entries[0]?.[0]?.slice(5)}</span>
        <span>Today</span>
      </div>
    </div>
  )
}

// ── User table ─────────────────────────────────────────────────────────────

function UserTable({ users }) {
  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = users
    .filter(u => !search || u.email?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })

  const SortHeader = ({ label, k }) => (
    <th
      onClick={() => handleSort(k)}
      style={{
        padding: '10px 12px', textAlign: 'left',
        fontSize: '0.68rem', fontWeight: 700,
        color: sortKey === k ? '#f59e0b' : '#475569',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        cursor: 'pointer', whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.3)',
        userSelect: 'none',
      }}
    >
      {label} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Table header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e2e8f0' }}>
          👥 All Users
          <span style={{ marginLeft: 8, fontSize: '0.72rem', color: '#475569', fontWeight: 400 }}>
            {filtered.length} of {users.length}
          </span>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search email…"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 12px',
            color: '#e2e8f0', fontSize: '0.8rem',
            outline: 'none', width: 200,
          }}
        />
      </div>

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <SortHeader label="Email"        k="email"       />
              <SortHeader label="Joined"       k="createdAt"   />
              <SortHeader label="Last Seen"    k="lastSignIn"  />
              <SortHeader label="Cards"        k="totalCards"  />
              <SortHeader label="Unique Cards" k="uniqueCards" />
              <SortHeader label="Matches"      k="matchCount"  />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr
                key={u.id}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '10px 12px', color: '#e2e8f0', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: `hsl(${(u.email?.charCodeAt(0) || 0) * 15}, 55%, 35%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}>
                      {u.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                      {u.email}
                    </span>
                    {u.email === ADMIN_EMAIL && (
                      <span style={{ fontSize: '0.6rem', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>
                        ADMIN
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '10px 12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: u.lastSignIn && (Date.now() - new Date(u.lastSignIn)) < 7 * 86400000 ? '#4ade80' : '#64748b' }}>
                    {fmtRelative(u.lastSignIn)}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {u.totalCards > 0
                    ? <span style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{u.totalCards}</span>
                    : <span style={{ color: '#334155' }}>—</span>
                  }
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>
                  {u.uniqueCards || '—'}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  {u.matchCount > 0
                    ? <span style={{ background: 'rgba(16,185,129,0.12)', color: '#34d399', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>{u.matchCount}</span>
                    : <span style={{ color: '#334155' }}>—</span>
                  }
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#334155' }}>
                  No users match that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function AdminPanel({ user }) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [lastFetched, setLastFetched] = useState(null)

  // Guard: only the admin can see this page
  if (!user || user.email !== ADMIN_EMAIL) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#475569' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, color: '#64748b' }}>Access Denied</div>
      </div>
    )
  }

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not signed in')

      const res  = await fetch('/.netlify/functions/admin-stats', {
        headers: { 'Authorization': `Bearer ${jwt}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setData(json)
      setLastFetched(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  const { totals, users, signupsByDay } = data || {}

  // Engagement rate: users with at least 1 card
  const engagementRate = totals
    ? Math.round((totals.usersWithCollection / Math.max(totals.users, 1)) * 100)
    : null

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        borderRadius: 12, padding: '18px 20px', marginBottom: 20,
        border: '1px solid rgba(99,102,241,0.25)',
        boxShadow: '0 4px 20px rgba(99,102,241,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.15em', color: '#6366f1', textTransform: 'uppercase', marginBottom: 4 }}>
              Admin Only
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.5px' }}>
              🎛️ Control Center
            </div>
            {lastFetched && (
              <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 4 }}>
                Last refreshed {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: loading ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.78rem', fontWeight: 600,
            }}
          >
            <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ borderRadius: 10, padding: 16, marginBottom: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: '0.85rem' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ height: 100, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* ── Stats grid ── */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard icon="👤" label="Total Users"        value={totals.users}                color="#6366f1" />
          <StatCard icon="🆕" label="New This Week"      value={totals.newLast7d}             color="#22c55e"
            sub={`${totals.newLast30d} this month`} />
          <StatCard icon="📦" label="Active Collections" value={totals.usersWithCollection}   color="#3b82f6"
            sub={`${engagementRate}% of users`} />
          <StatCard icon="🃏" label="Cards Tracked"      value={totals.totalCards?.toLocaleString()} color="#f59e0b"
            sub={`${totals.totalUniqueCards} unique`} />
          <StatCard icon="⚔️" label="Matches Logged"     value={totals.totalMatches?.toLocaleString()} color="#ec4899" />
          <StatCard icon="📊" label="Engagement Rate"    value={`${engagementRate}%`}         color="#14b8a6"
            sub="users with ≥1 card" />
        </div>
      )}

      {/* ── Signup chart ── */}
      {signupsByDay && <SignupChart signupsByDay={signupsByDay} />}

      {/* ── User table ── */}
      {users && <UserTable users={users} />}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:0.4; } 50% { opacity:0.8; } }
      `}</style>
    </div>
  )
}
