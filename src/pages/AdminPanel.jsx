import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { upsertStoreListing } from '../lib/db'

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

// ── Listings tab ────────────────────────────────────────────────────────────

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG']

const PRODUCT_FORMATS = ['Draft Booster', 'Set Booster', 'Collector Booster', 'Draft Booster Box', 'Set Booster Box', 'Collector Booster Box', 'Bundle', 'Commander Deck', 'Starter Kit', 'Gift Bundle', 'Other']

function CreateListingModal({ onClose, onSaved }) {
  const [form,     setForm]     = useState({ product_type: 'single', name: '', set_name: '', condition: 'NM', is_foil: false, price: '', qty_available: 1, img_url: '', active: true, scryfall_id: null, product_format: '', description: '' })
  const [query,    setQuery]    = useState('')
  const [results,  setResults]  = useState([])
  const [searching,setSearching]= useState(false)
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState(null)
  const [imageUploading,setImageUploading]= useState(false)

  const searchScryfall = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res  = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=names&limit=8`)
      const data = await res.json()
      setResults(data.data || [])
    } catch { setResults([]) }
    setSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchScryfall(query), 400)
    return () => clearTimeout(t)
  }, [query, searchScryfall])

  const handleImageUpload = async (file) => {
    if (!file) return
    const MAX_MB = 5
    if (file.size > MAX_MB * 1024 * 1024) { setErr(`Image must be under ${MAX_MB}MB`); return }
    setImageUploading(true); setErr(null)
    try {
      const ext  = file.name.split('.').pop().toLowerCase()
      const path = `listings/${Date.now()}.${ext}`
      const { data, error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(data.path)
      setForm(f => ({ ...f, img_url: publicUrl }))
    } catch (e) {
      setErr(`Upload failed: ${e.message}`)
    } finally {
      setImageUploading(false)
    }
  }

  const pickCard = (card) => {
    setForm(f => ({
      ...f,
      name:        card.name,
      set_name:    card.set_name || card.set?.toUpperCase() || '',
      img_url:     card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '',
      price:       f.price || card.prices?.usd || '',
      scryfall_id: card.id || null,
    }))
    setQuery(card.name)
    setResults([])
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name || !form.price) { setErr('Name and price are required'); return }
    setSaving(true); setErr(null)
    try {
      const qty = parseInt(form.qty_available, 10) || 1
      if (form.product_type === 'single') {
        const { merged } = await upsertStoreListing({
          name:        form.name.trim(),
          set_name:    form.set_name.trim() || null,
          condition:   form.condition,
          is_foil:     form.is_foil,
          price:       parseFloat(form.price),
          img_url:     form.img_url.trim() || null,
          scryfall_id: form.scryfall_id || null,
          qty,
        })
        setSaving(false)
        onSaved(merged)
      } else {
        const { error: insErr } = await supabase.from('store_listings').insert({
          product_type:    form.product_type,
          name:            form.name.trim(),
          set_name:        form.set_name.trim() || null,
          price:           parseFloat(form.price),
          qty_available:   qty,
          img_url:         form.img_url.trim() || null,
          active:          form.active,
          product_format:  form.product_format || null,
          description:     form.description.trim() || null,
        })
        if (insErr) throw new Error(insErr.message)
        setSaving(false)
        onSaved(false)
      }
      onClose()
    } catch (err) {
      setSaving(false)
      setErr(err.message)
    }
  }

  const inp = (label, key, type = 'text', extra = {}) => (
    <div>
      <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: type === 'checkbox' ? e.target.checked : e.target.value }))} className="form-input"
        style={{ width: '100%', padding: '9px 12px', fontSize: '.85rem', boxSizing: 'border-box', ...extra.style }}
        {...extra} />
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, zIndex: 401, padding: '22px 22px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f1f5f9' }}>New Listing</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Product type selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[
            { id: 'single',   label: '🃏 Single'   },
            { id: 'sealed',   label: '📦 Sealed'   },
            { id: 'resealed', label: '🎴 Resealed' },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => setForm(f => ({ ...f, product_type: t.id }))} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${form.product_type === t.id ? '#c9a84c' : 'rgba(255,255,255,.12)'}`,
              background: form.product_type === t.id ? 'rgba(201,168,76,.15)' : 'transparent',
              color: form.product_type === t.id ? '#c9a84c' : '#64748b',
              fontWeight: form.product_type === t.id ? 700 : 400, fontSize: '.78rem', cursor: 'pointer',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Card search — singles only */}
        {form.product_type === 'single' && (
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Search Card Name</label>
            <input
              value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Lightning Bolt"
              className="form-input"
              style={{ width: '100%', padding: '9px 12px', fontSize: '.85rem', boxSizing: 'border-box' }}
            />
            {searching && <div style={{ fontSize: '.7rem', color: '#64748b', marginTop: 4 }}>Searching…</div>}
            {results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, zIndex: 10, maxHeight: 220, overflowY: 'auto' }}>
                {results.map(c => (
                  <div key={c.id} onClick={() => pickCard(c)} style={{ display: 'flex', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.05)', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {(c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small) &&
                      <img src={c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small} style={{ width: 30, borderRadius: 3 }} alt="" />}
                    <div>
                      <div style={{ fontSize: '.82rem', color: '#e2e8f0', fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '.65rem', color: '#64748b' }}>{c.set_name} · {c.prices?.usd ? `$${c.prices.usd}` : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {inp(form.product_type === 'single' ? 'Card Name' : 'Product Name', 'name', 'text', { required: true, placeholder: form.product_type === 'single' ? 'Lightning Bolt' : form.product_type === 'sealed' ? 'Duskmourn: House of Horror Booster Box' : 'Vaulted Rarities — Vol. 1' })}
          {form.product_type !== 'resealed' && inp('Set Name', 'set_name', 'text', { placeholder: form.product_type === 'single' ? 'e.g. Magic 2011' : 'e.g. Duskmourn' })}

          {/* Singles: condition + foil */}
          {form.product_type === 'single' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Condition</label>
                  <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} className="form-input" style={{ width: '100%', padding: '9px 10px', fontSize: '.85rem' }}>
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {inp('Price ($)', 'price', 'number', { required: true, step: '0.01', min: '0.01', placeholder: '0.99' })}
                {inp('Qty', 'qty_available', 'number', { min: '0', style: { padding: '9px 8px' } })}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8' }}>
                  <input type="checkbox" checked={form.is_foil} onChange={e => setForm(f => ({ ...f, is_foil: e.target.checked }))} />
                  ✦ Foil
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                  Active (visible in store)
                </label>
              </div>
            </>
          )}

          {/* Sealed: product format */}
          {form.product_type === 'sealed' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Format</label>
                  <select value={form.product_format} onChange={e => setForm(f => ({ ...f, product_format: e.target.value }))} className="form-input" style={{ width: '100%', padding: '9px 10px', fontSize: '.85rem' }}>
                    <option value="">— Select —</option>
                    {PRODUCT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                {inp('Price ($)', 'price', 'number', { required: true, step: '0.01', min: '0.01', placeholder: '24.99' })}
                {inp('Qty', 'qty_available', 'number', { min: '0', style: { padding: '9px 8px' } })}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8' }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                Active (visible in store)
              </label>
            </>
          )}

          {/* Resealed: description */}
          {form.product_type === 'resealed' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                {inp('Price ($)', 'price', 'number', { required: true, step: '0.01', min: '0.01', placeholder: '14.99' })}
                {inp('Qty', 'qty_available', 'number', { min: '0', style: { padding: '9px 8px' } })}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Pack Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. 5 hand-picked rare and mythic singles. May include foils, special treatments, or chase cards."
                  className="form-input"
                  style={{ width: '100%', padding: '9px 12px', fontSize: '.82rem', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8' }}>
                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                Active (visible in store)
              </label>
            </>
          )}

          {/* Singles: URL display (auto-filled from Scryfall) */}
          {form.product_type === 'single' && (
            <>
              {form.img_url && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <img src={form.img_url} style={{ width: 44, borderRadius: 4 }} alt="" />
                  <div style={{ fontSize: '.7rem', color: '#64748b', flex: 1, wordBreak: 'break-all' }}>{form.img_url}</div>
                </div>
              )}
              {inp('Image URL (auto-filled from search)', 'img_url', 'text', { placeholder: 'https://…' })}
            </>
          )}

          {/* Sealed / Resealed: upload button */}
          {form.product_type !== 'single' && (
            <div>
              <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                Product Image
              </label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {form.img_url && (
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    <img src={form.img_url} style={{ width: 56, height: 74, objectFit: 'cover', borderRadius: 6, display: 'block' }} alt="" />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, img_url: '' }))}
                      style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#f87171', color: '#fff', fontSize: '.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}
                    >✕</button>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <input
                    type="file"
                    id="img-upload"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={e => handleImageUpload(e.target.files[0])}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="img-upload" style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 8, cursor: imageUploading ? 'not-allowed' : 'pointer',
                    border: '1px dashed rgba(255,255,255,.2)',
                    background: imageUploading ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.04)',
                    color: imageUploading ? '#475569' : '#94a3b8', fontSize: '.82rem',
                    transition: 'all .15s',
                  }}>
                    <span style={{ fontSize: '1rem' }}>{imageUploading ? '⏳' : '📷'}</span>
                    {imageUploading ? 'Uploading…' : form.img_url ? 'Replace Image' : 'Upload Image'}
                  </label>
                  <div style={{ fontSize: '.62rem', color: '#334155', marginTop: 4 }}>JPG, PNG, WebP · max 5 MB</div>
                </div>
              </div>
            </div>
          )}

          {err && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, color: '#fca5a5', fontSize: '.78rem' }}>{err}</div>}

          <button type="submit" disabled={saving} style={{ padding: '12px', borderRadius: 10, border: 'none', background: '#c9a84c', color: '#000', fontWeight: 800, fontSize: '.88rem', cursor: saving ? 'not-allowed' : 'pointer', marginTop: 4 }}>
            {saving ? 'Saving…' : 'Create Listing'}
          </button>
        </form>
      </div>
    </>
  )
}

// ── Edit listing modal ─────────────────────────────────────────────────────────
function EditListingModal({ listing, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:           listing.name || '',
    set_name:       listing.set_name || '',
    condition:      listing.condition || 'NM',
    is_foil:        listing.is_foil || false,
    price:          listing.price || '',
    qty_available:  listing.qty_available ?? 1,
    img_url:        listing.img_url || '',
    active:         listing.active ?? true,
    product_format: listing.product_format || '',
    description:    listing.description || '',
    product_type:   listing.product_type || 'single',
  })
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState(null)
  const [imageUploading,setImageUploading]= useState(false)

  const handleImageUpload = async (file) => {
    if (!file) return
    const MAX_MB = 5
    if (file.size > MAX_MB * 1024 * 1024) { setErr(`Image must be under ${MAX_MB}MB`); return }
    setImageUploading(true); setErr(null)
    try {
      const ext  = file.name.split('.').pop().toLowerCase()
      const path = `listings/${Date.now()}.${ext}`
      const { data, error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(data.path)
      setForm(f => ({ ...f, img_url: publicUrl }))
    } catch (e) { setErr(`Upload failed: ${e.message}`) }
    finally { setImageUploading(false) }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name || !form.price) { setErr('Name and price are required'); return }
    setSaving(true); setErr(null)
    try {
      const { error: updErr } = await supabase.from('store_listings').update({
        name:           form.name.trim(),
        set_name:       form.set_name.trim() || null,
        condition:      form.product_type === 'single' ? form.condition : null,
        is_foil:        form.product_type === 'single' ? form.is_foil : false,
        price:          parseFloat(form.price),
        qty_available:  parseInt(form.qty_available, 10) || 0,
        img_url:        form.img_url.trim() || null,
        active:         form.active,
        product_format: form.product_type === 'sealed' ? (form.product_format || null) : null,
        description:    form.product_type === 'resealed' ? (form.description.trim() || null) : null,
      }).eq('id', listing.id)
      if (updErr) throw new Error(updErr.message)
      onSaved()
      onClose()
    } catch (err) {
      setSaving(false)
      setErr(err.message)
    }
  }

  const inp = (label, key, type = 'text', extra = {}) => (
    <div>
      <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="form-input" style={{ width: '100%', padding: '9px 12px', fontSize: '.85rem', boxSizing: 'border-box', ...extra.style }} {...extra} />
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, zIndex: 401, padding: '22px 22px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f1f5f9' }}>Edit Listing</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Product type badge (read-only) */}
        <div style={{ marginBottom: 14, fontSize: '.72rem', color: '#64748b' }}>
          Type: <span style={{ fontWeight: 700, color: '#c9a84c' }}>{form.product_type}</span>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {inp(form.product_type === 'single' ? 'Card Name' : 'Product Name', 'name', 'text', { required: true })}
          {form.product_type !== 'resealed' && inp('Set Name', 'set_name')}

          {form.product_type === 'single' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Condition</label>
                  <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} className="form-input" style={{ width: '100%', padding: '9px 10px', fontSize: '.85rem' }}>
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {inp('Price ($)', 'price', 'number', { required: true, step: '0.01', min: '0.01' })}
                {inp('Qty', 'qty_available', 'number', { min: '0', style: { padding: '9px 8px' } })}
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8' }}>
                <input type="checkbox" checked={form.is_foil} onChange={e => setForm(f => ({ ...f, is_foil: e.target.checked }))} />
                ✦ Foil
              </label>
            </>
          )}

          {form.product_type === 'sealed' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Format</label>
                <select value={form.product_format} onChange={e => setForm(f => ({ ...f, product_format: e.target.value }))} className="form-input" style={{ width: '100%', padding: '9px 10px', fontSize: '.85rem' }}>
                  <option value="">— Select —</option>
                  {PRODUCT_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {inp('Price ($)', 'price', 'number', { required: true, step: '0.01', min: '0.01' })}
              {inp('Qty', 'qty_available', 'number', { min: '0', style: { padding: '9px 8px' } })}
            </div>
          )}

          {form.product_type === 'resealed' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
                {inp('Price ($)', 'price', 'number', { required: true, step: '0.01', min: '0.01' })}
                {inp('Qty', 'qty_available', 'number', { min: '0', style: { padding: '9px 8px' } })}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Pack Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="form-input" style={{ width: '100%', padding: '9px 12px', fontSize: '.82rem', boxSizing: 'border-box', minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
            </>
          )}

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem', color: '#94a3b8' }}>
            <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Active (visible in store)
          </label>

          {/* Image */}
          {form.product_type === 'single' ? (
            <>
              {form.img_url && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <img src={form.img_url} style={{ width: 44, borderRadius: 4 }} alt="" />
                <div style={{ fontSize: '.7rem', color: '#64748b', flex: 1, wordBreak: 'break-all' }}>{form.img_url}</div>
              </div>}
              {inp('Image URL', 'img_url', 'text', { placeholder: 'https://…' })}
            </>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Product Image</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {form.img_url && (
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    <img src={form.img_url} style={{ width: 56, height: 74, objectFit: 'cover', borderRadius: 6 }} alt="" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, img_url: '' }))}
                      style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#f87171', color: '#fff', fontSize: '.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>✕</button>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <input type="file" id="edit-img-upload" accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={e => handleImageUpload(e.target.files[0])} style={{ display: 'none' }} />
                  <label htmlFor="edit-img-upload" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8,
                    cursor: imageUploading ? 'not-allowed' : 'pointer', border: '1px dashed rgba(255,255,255,.2)',
                    background: imageUploading ? 'rgba(255,255,255,.02)' : 'rgba(255,255,255,.04)',
                    color: imageUploading ? '#475569' : '#94a3b8', fontSize: '.82rem',
                  }}>
                    <span style={{ fontSize: '1rem' }}>{imageUploading ? '⏳' : '📷'}</span>
                    {imageUploading ? 'Uploading…' : form.img_url ? 'Replace Image' : 'Upload Image'}
                  </label>
                </div>
              </div>
            </div>
          )}

          {err && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, color: '#fca5a5', fontSize: '.78rem' }}>{err}</div>}

          <button type="submit" disabled={saving} style={{ padding: '12px', borderRadius: 10, border: 'none', background: '#c9a84c', color: '#000', fontWeight: 800, fontSize: '.88rem', cursor: saving ? 'not-allowed' : 'pointer', marginTop: 4 }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>
    </>
  )
}

// ── Bulk CSV import modal ──────────────────────────────────────────────────────
function BulkImportModal({ onClose, onSaved }) {
  const [csv,     setCsv]     = useState('')
  const [rows,    setRows]    = useState(null)  // parsed preview rows
  const [parseErr,setParseErr]= useState(null)
  const [saving,  setSaving]  = useState(false)
  const [result,  setResult]  = useState(null)

  const TEMPLATE = `name,set_name,condition,price,qty_available,is_foil
Lightning Bolt,Magic 2011,NM,2.49,3,false
Black Lotus,Alpha,NM,9999.00,1,false
Mox Pearl,Beta,LP,1250.00,1,false`

  const parseCSV = (text) => {
    setParseErr(null); setRows(null)
    if (!text.trim()) return
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) { setParseErr('Need at least a header row and one data row'); return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const required = ['name', 'price']
    for (const r of required) {
      if (!headers.includes(r)) { setParseErr(`Missing required column: "${r}"`); return }
    }
    const parsed = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim())
      const row = {}
      headers.forEach((h, idx) => { row[h] = cols[idx] ?? '' })
      if (!row.name || !row.price) { setParseErr(`Row ${i + 1}: name and price are required`); return }
      if (isNaN(parseFloat(row.price))) { setParseErr(`Row ${i + 1}: invalid price "${row.price}"`); return }
      parsed.push({
        product_type:  'single',
        name:          row.name,
        set_name:      row.set_name || null,
        condition:     row.condition || 'NM',
        price:         parseFloat(row.price),
        qty_available: parseInt(row.qty_available, 10) || 1,
        is_foil:       row.is_foil === 'true' || row.is_foil === '1',
        active:        true,
      })
    }
    setRows(parsed)
  }

  useEffect(() => { parseCSV(csv) }, [csv]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = async () => {
    if (!rows || rows.length === 0) return
    setSaving(true); setResult(null)
    try {
      const { error: insErr } = await supabase.from('store_listings').insert(rows)
      if (insErr) throw new Error(insErr.message)
      setResult({ ok: true, count: rows.length })
      onSaved()
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(640px,96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#0f172a', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, zIndex: 401, padding: '22px 22px 26px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f1f5f9' }}>📋 Bulk Import (CSV)</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 14 }}>
          Paste a CSV with columns: <code style={{ color: '#94a3b8' }}>name</code>, <code style={{ color: '#94a3b8' }}>set_name</code>, <code style={{ color: '#94a3b8' }}>condition</code>, <code style={{ color: '#94a3b8' }}>price</code>, <code style={{ color: '#94a3b8' }}>qty_available</code>, <code style={{ color: '#94a3b8' }}>is_foil</code>. Only <code style={{ color: '#c9a84c' }}>name</code> and <code style={{ color: '#c9a84c' }}>price</code> are required.
        </div>

        <button onClick={() => setCsv(TEMPLATE)} style={{ fontSize: '.7rem', padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#94a3b8', cursor: 'pointer', marginBottom: 8 }}>
          Load example
        </button>

        <textarea
          value={csv}
          onChange={e => setCsv(e.target.value)}
          placeholder={`name,set_name,condition,price,qty_available,is_foil\nLightning Bolt,Magic 2011,NM,2.49,3,false`}
          style={{ width: '100%', minHeight: 140, padding: '10px 12px', fontSize: '.78rem', fontFamily: 'monospace', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: '#e2e8f0', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
        />

        {parseErr && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, color: '#fca5a5', fontSize: '.78rem' }}>⚠️ {parseErr}</div>
        )}

        {/* Preview table */}
        {rows && rows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '.7rem', color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>
              Preview — {rows.length} row{rows.length !== 1 ? 's' : ''} ready to import
            </div>
            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,.05)' }}>
                    {['Name','Set','Cond','Price','Qty','Foil'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                      <td style={{ padding: '6px 10px', color: '#e2e8f0', fontWeight: 600 }}>{r.name}</td>
                      <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.set_name || '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r.condition}</td>
                      <td style={{ padding: '6px 10px', color: '#c9a84c', fontWeight: 700 }}>${r.price.toFixed(2)}</td>
                      <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{r.qty_available}</td>
                      <td style={{ padding: '6px 10px', color: r.is_foil ? '#c084fc' : '#334155' }}>{r.is_foil ? '✦' : '—'}</td>
                    </tr>
                  ))}
                  {rows.length > 10 && (
                    <tr><td colSpan={6} style={{ padding: '6px 10px', color: '#475569', fontStyle: 'italic' }}>…and {rows.length - 10} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: '.78rem', background: result.ok ? 'rgba(74,222,128,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${result.ok ? 'rgba(74,222,128,.25)' : 'rgba(239,68,68,.25)'}`, color: result.ok ? '#4ade80' : '#fca5a5' }}>
            {result.ok ? `✓ Imported ${result.count} listing${result.count !== 1 ? 's' : ''} successfully!` : `⚠️ Import failed: ${result.message}`}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '.85rem' }}>Cancel</button>
          <button
            onClick={handleImport}
            disabled={!rows || rows.length === 0 || saving}
            style={{ flex: 1, padding: 11, borderRadius: 10, border: 'none', background: (!rows || rows.length === 0) ? 'rgba(201,168,76,.3)' : '#c9a84c', color: '#000', fontWeight: 800, fontSize: '.85rem', cursor: (!rows || rows.length === 0 || saving) ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Importing…' : rows && rows.length > 0 ? `Import ${rows.length} listing${rows.length !== 1 ? 's' : ''}` : 'Paste CSV above'}
          </button>
        </div>
      </div>
    </>
  )
}

function ListingsTab() {
  const [listings,     setListings]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showCreate,   setShowCreate]   = useState(false)
  const [showBulk,     setShowBulk]     = useState(false)
  const [editListing,  setEditListing]  = useState(null)
  const [search,       setSearch]       = useState('')
  const [syncing,      setSyncing]      = useState(false)
  const [syncResult,   setSyncResult]   = useState(null)
  const [sort,         setSort]         = useState('newest')
  const [filterActive, setFilterActive] = useState('all')
  const [merging,      setMerging]      = useState(false)
  const [mergeResult,  setMergeResult]  = useState(null)

  const fetchListings = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('store_listings').select('*').order('created_at', { ascending: true })
    setListings(data || [])
    setLoading(false)
  }, [])

  const mergeDuplicates = async () => {
    if (!window.confirm('This will merge all listings with the same name + condition + foil into one row, summing their quantities. Continue?')) return
    setMerging(true)
    setMergeResult(null)
    try {
      // Fetch all in created_at order (oldest first = keeper)
      const { data: all, error } = await supabase.from('store_listings').select('*').order('created_at', { ascending: true })
      if (error) throw error

      // Group by name + condition + is_foil
      const groups = {}
      for (const l of all) {
        const key = `${l.name}|||${l.condition || 'NM'}|||${!!l.is_foil}`
        if (!groups[key]) groups[key] = []
        groups[key].push(l)
      }

      let mergedCount = 0
      for (const group of Object.values(groups)) {
        if (group.length <= 1) continue

        const keeper   = group[0]
        const totalQty = group.reduce((s, l) => s + (l.qty_available || 0), 0)
        // Keep lowest price so the listing stays competitive
        const minPrice = Math.min(...group.map(l => parseFloat(l.price || 0)))

        // Update the keeper row
        const { error: updErr } = await supabase
          .from('store_listings')
          .update({ qty_available: totalQty, price: minPrice, active: true })
          .eq('id', keeper.id)
        if (updErr) throw updErr

        // Delete the duplicate rows
        const dupeIds = group.slice(1).map(l => l.id)
        const { error: delErr } = await supabase.from('store_listings').delete().in('id', dupeIds)
        if (delErr) throw delErr

        mergedCount += group.length - 1
      }

      await fetchListings()
      setMergeResult({ ok: true, count: mergedCount })
    } catch (err) {
      setMergeResult({ ok: false, message: err.message })
    } finally {
      setMerging(false)
    }
  }

  const syncPrices = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not signed in')

      const res  = await fetch('/.netlify/functions/update-prices', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${jwt}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      setSyncResult({ ok: true, ...json })
      // Refresh listings to show updated prices
      await fetchListings()
    } catch (e) {
      setSyncResult({ ok: false, message: e.message })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => { fetchListings() }, [fetchListings])

  const toggleActive = async (id, current) => {
    await supabase.from('store_listings').update({ active: !current }).eq('id', id)
    setListings(prev => prev.map(l => l.id === id ? { ...l, active: !current } : l))
  }

  const deleteListing = async (id) => {
    if (!window.confirm('Delete this listing?')) return
    await supabase.from('store_listings').delete().eq('id', id)
    setListings(prev => prev.filter(l => l.id !== id))
  }

  // ── Inventory stats ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = listings.filter(l => l.active && l.qty_available > 0)
    return {
      totalListings:  listings.length,
      liveCount:      active.length,
      totalUnits:     active.reduce((s, l) => s + (l.qty_available || 0), 0),
      inventoryValue: active.reduce((s, l) => s + parseFloat(l.price || 0) * (l.qty_available || 0), 0),
    }
  }, [listings])

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let out = listings
    if (search) out = out.filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    if (filterActive === 'live')   out = out.filter(l => l.active)
    if (filterActive === 'hidden') out = out.filter(l => !l.active)
    switch (sort) {
      case 'az':         out = [...out].sort((a, b) => a.name.localeCompare(b.name)); break
      case 'za':         out = [...out].sort((a, b) => b.name.localeCompare(a.name)); break
      case 'price-asc':  out = [...out].sort((a, b) => parseFloat(a.price) - parseFloat(b.price)); break
      case 'price-desc': out = [...out].sort((a, b) => parseFloat(b.price) - parseFloat(a.price)); break
      case 'qty-desc':   out = [...out].sort((a, b) => (b.qty_available || 0) - (a.qty_available || 0)); break
      case 'newest':
      default:           break // already ordered by created_at desc from DB
    }
    return out
  }, [listings, search, sort, filterActive])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: syncResult ? 10 : 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search listings…" value={search} onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 160, padding: '8px 12px', fontSize: '.82rem' }}
        />
        <button
          onClick={mergeDuplicates}
          disabled={merging}
          title="Merge listings with the same name + condition + foil into one row"
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,.3)', background: 'rgba(139,92,246,.1)', color: '#c4b5fd', fontWeight: 700, fontSize: '.82rem', cursor: merging ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: merging ? 0.7 : 1 }}
        >
          {merging ? '⏳ Merging…' : '🔀 Merge Dupes'}
        </button>
        <button
          onClick={syncPrices}
          disabled={syncing}
          title="Sync all prices with current Scryfall market data"
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(16,185,129,.3)', background: 'rgba(16,185,129,.12)', color: '#6ee7b7', fontWeight: 700, fontSize: '.82rem', cursor: syncing ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: syncing ? 0.7 : 1 }}
        >
          {syncing ? '⏳ Syncing…' : '🔄 Sync Prices'}
        </button>
        <button
          onClick={() => setShowBulk(true)}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(59,130,246,.3)', background: 'rgba(59,130,246,.1)', color: '#93c5fd', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', flexShrink: 0 }}
        >
          📋 Bulk Import
        </button>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#c9a84c', color: '#000', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer', flexShrink: 0 }}
        >
          + New Listing
        </button>
      </div>

      {/* ── Inventory stats bar ── */}
      {!loading && listings.length > 0 && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12,
          padding: '10px 14px', borderRadius: 10,
          background: 'rgba(201,168,76,.06)', border: '1px solid rgba(201,168,76,.15)',
        }}>
          <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
            <span style={{ fontWeight: 700, color: '#c9a84c', fontSize: '.88rem' }}>{stats.liveCount}</span> live listings
          </div>
          <div style={{ color: 'rgba(255,255,255,.15)' }}>·</div>
          <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
            <span style={{ fontWeight: 700, color: '#c9a84c', fontSize: '.88rem' }}>{stats.totalUnits}</span> units in stock
          </div>
          <div style={{ color: 'rgba(255,255,255,.15)' }}>·</div>
          <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>
            Inventory value: <span style={{ fontWeight: 800, color: '#4ade80', fontSize: '.88rem' }}>${stats.inventoryValue.toFixed(2)}</span>
          </div>
          {stats.totalListings !== stats.liveCount && (
            <>
              <div style={{ color: 'rgba(255,255,255,.15)' }}>·</div>
              <div style={{ fontSize: '.72rem', color: '#475569' }}>{stats.totalListings - stats.liveCount} hidden</div>
            </>
          )}
        </div>
      )}

      {/* ── Sort + filter controls ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={sort} onChange={e => setSort(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: '#cbd5e1', fontSize: '.75rem', cursor: 'pointer' }}
        >
          <option value="newest">Newest first</option>
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="price-desc">Price: High → Low</option>
          <option value="price-asc">Price: Low → High</option>
          <option value="qty-desc">Most in stock</option>
        </select>
        {['all','live','hidden'].map(f => (
          <button key={f} onClick={() => setFilterActive(f)} style={{
            padding: '5px 12px', borderRadius: 7, border: `1px solid ${filterActive === f ? 'rgba(201,168,76,.4)' : 'rgba(255,255,255,.1)'}`,
            background: filterActive === f ? 'rgba(201,168,76,.12)' : 'transparent',
            color: filterActive === f ? '#c9a84c' : '#64748b',
            fontSize: '.72rem', fontWeight: filterActive === f ? 700 : 400, cursor: 'pointer',
          }}>
            {f === 'all' ? 'All' : f === 'live' ? '🟢 Live' : '⚫ Hidden'}
          </button>
        ))}
        {(search || filterActive !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterActive('all') }} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,.25)', background: 'none', color: '#f87171', fontSize: '.72rem', cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </div>

      {mergeResult && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: '.78rem',
          background: mergeResult.ok ? 'rgba(139,92,246,.08)' : 'rgba(239,68,68,.08)',
          border: `1px solid ${mergeResult.ok ? 'rgba(139,92,246,.25)' : 'rgba(239,68,68,.25)'}`,
          color: mergeResult.ok ? '#c4b5fd' : '#fca5a5',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        }}>
          {mergeResult.ok
            ? mergeResult.count === 0
              ? '✓ No duplicates found — all listings are already unique'
              : `✓ Merged ${mergeResult.count} duplicate row${mergeResult.count !== 1 ? 's' : ''}`
            : `⚠️ Merge failed: ${mergeResult.message}`
          }
          <button onClick={() => setMergeResult(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.9rem', opacity: 0.6, flexShrink: 0 }}>✕</button>
        </div>
      )}
      {syncResult && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: '.78rem',
          background: syncResult.ok ? 'rgba(16,185,129,.08)' : 'rgba(239,68,68,.08)',
          border: `1px solid ${syncResult.ok ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.25)'}`,
          color: syncResult.ok ? '#6ee7b7' : '#fca5a5',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        }}>
          {syncResult.ok
            ? `✓ Synced — ${syncResult.updated} price${syncResult.updated !== 1 ? 's' : ''} updated, ${syncResult.skipped} unchanged (${syncResult.total} total)`
            : `⚠️ Sync failed: ${syncResult.message}`
          }
          <button onClick={() => setSyncResult(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.9rem', opacity: 0.6, flexShrink: 0 }}>✕</button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading listings…</div>}
      {!loading && listings.length === 0 && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏪</div>
          <div>No listings yet. Create your first one!</div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(l => (
            <div key={l.id} style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${l.active ? 'rgba(201,168,76,.2)' : 'rgba(255,255,255,.06)'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {l.img_url && <img src={l.img_url} alt="" style={{ width: 36, borderRadius: 4, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#e2e8f0' }}>{l.name} {l.is_foil && '✦'}</div>
                <div style={{ fontSize: '.68rem', color: '#64748b' }}>{l.set_name} · {l.condition}</div>
              </div>
              <div style={{ fontWeight: 800, color: '#c9a84c', fontSize: '.88rem', flexShrink: 0 }}>${parseFloat(l.price).toFixed(2)}</div>
              <div style={{ fontSize: '.75rem', color: l.qty_available > 0 ? '#4ade80' : '#f87171', flexShrink: 0 }}>
                {l.qty_available} left
              </div>
              <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: l.active ? 'rgba(74,222,128,.15)' : 'rgba(255,255,255,.05)', color: l.active ? '#4ade80' : '#64748b', flexShrink: 0 }}>
                {l.active ? 'Live' : 'Hidden'}
              </span>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => setEditListing(l)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(201,168,76,.3)', background: 'none', color: '#c9a84c', cursor: 'pointer', fontSize: '.7rem', fontWeight: 600 }}>
                  Edit
                </button>
                <button onClick={() => toggleActive(l.id, l.active)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,.1)', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '.7rem', fontWeight: 600 }}>
                  {l.active ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => deleteListing(l.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)', background: 'none', color: '#f87171', cursor: 'pointer', fontSize: '.7rem', fontWeight: 600 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateListingModal onClose={() => setShowCreate(false)} onSaved={(merged) => { fetchListings(); if (merged) alert('Existing listing found — quantity updated instead of creating a duplicate.') }} />}
      {showBulk && <BulkImportModal onClose={() => setShowBulk(false)} onSaved={() => { fetchListings() }} />}
      {editListing && <EditListingModal listing={editListing} onClose={() => setEditListing(null)} onSaved={() => { fetchListings(); setEditListing(null) }} />}
    </div>
  )
}

// ── Orders tab ───────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  pending:   { bg: 'rgba(100,116,139,.2)', color: '#94a3b8' },
  paid:      { bg: 'rgba(234,179,8,.15)',  color: '#facc15' },
  shipped:   { bg: 'rgba(59,130,246,.15)', color: '#60a5fa' },
  delivered: { bg: 'rgba(74,222,128,.15)', color: '#4ade80' },
  refunded:  { bg: 'rgba(239,68,68,.15)',  color: '#f87171' },
}

function OrdersTab() {
  const [orders,   setOrders]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [tracking, setTracking] = useState({}) // orderId → { number, carrier }
  const [saving,   setSaving]   = useState(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const markShipped = async (orderId) => {
    const t = tracking[orderId] || {}
    setSaving(orderId)
    await supabase.from('orders').update({
      status: 'shipped',
      tracking_number: t.number || null,
      tracking_carrier: t.carrier || null,
    }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'shipped', tracking_number: t.number, tracking_carrier: t.carrier } : o))
    setSaving(null)
  }

  if (loading) return <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>Loading orders…</div>
  if (orders.length === 0) return (
    <div style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
      <div style={{ fontSize: '2rem', marginBottom: 8 }}>📦</div>
      <div>No orders yet.</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {orders.map(order => {
        const sc   = STATUS_COLORS[order.status] || STATUS_COLORS.pending
        const isEx = expanded === order.id
        const t    = tracking[order.id] || { number: order.tracking_number || '', carrier: order.tracking_carrier || '' }

        return (
          <div key={order.id} style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Row */}
            <div
              onClick={() => setExpanded(isEx ? null : order.id)}
              style={{ display: 'flex', gap: 12, padding: '12px 14px', cursor: 'pointer', alignItems: 'center', flexWrap: 'wrap' }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#e2e8f0' }}>{order.customer_name}</div>
                <div style={{ fontSize: '.68rem', color: '#64748b' }}>{order.customer_email} · {fmtDate(order.created_at)}</div>
              </div>
              <div style={{ fontWeight: 800, color: '#c9a84c', fontSize: '.9rem' }}>${parseFloat(order.total || 0).toFixed(2)}</div>
              <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                {order.status}
              </span>
              <span style={{ color: '#475569', fontSize: '.8rem' }}>{isEx ? '▲' : '▼'}</span>
            </div>

            {/* Expanded details */}
            {isEx && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: '14px 16px', background: 'rgba(0,0,0,.2)' }}>
                {/* Ship to */}
                <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 12 }}>
                  📬 {order.shipping_line1}, {order.shipping_city}, {order.shipping_state} {order.shipping_zip}
                </div>

                {/* Order items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {(order.order_items || []).map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.78rem' }}>
                      {item.img_url && <img src={item.img_url} style={{ width: 28, borderRadius: 3 }} alt="" />}
                      <span style={{ flex: 1, color: '#cbd5e1' }}>{item.name} ×{item.qty}</span>
                      <span style={{ color: '#c9a84c', fontWeight: 700 }}>${parseFloat(item.price * item.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Shipping + totals */}
                <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 14 }}>
                  Subtotal ${parseFloat(order.subtotal || 0).toFixed(2)} · Shipping ${parseFloat(order.shipping_cost || 0).toFixed(2)}
                </div>

                {/* Mark shipped */}
                {order.status === 'paid' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={{ fontSize: '.62rem', color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.5px' }}>Carrier</label>
                      <input
                        value={t.carrier}
                        onChange={e => setTracking(prev => ({ ...prev, [order.id]: { ...t, carrier: e.target.value } }))}
                        placeholder="USPS / UPS / FedEx"
                        className="form-input"
                        style={{ width: '100%', padding: '7px 10px', fontSize: '.78rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: 2, minWidth: 180 }}>
                      <label style={{ fontSize: '.62rem', color: '#64748b', display: 'block', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.5px' }}>Tracking Number</label>
                      <input
                        value={t.number}
                        onChange={e => setTracking(prev => ({ ...prev, [order.id]: { ...t, number: e.target.value } }))}
                        placeholder="9400111899…"
                        className="form-input"
                        style={{ width: '100%', padding: '7px 10px', fontSize: '.78rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <button
                      onClick={() => markShipped(order.id)}
                      disabled={saving === order.id}
                      style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '.78rem', cursor: 'pointer', flexShrink: 0 }}
                    >
                      {saving === order.id ? '…' : '📦 Mark Shipped'}
                    </button>
                  </div>
                )}
                {order.status === 'shipped' && order.tracking_number && (
                  <div style={{ fontSize: '.75rem', color: '#60a5fa' }}>
                    📦 Shipped via {order.tracking_carrier} · {order.tracking_number}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [shipping,    setShipping]    = useState('')
  const [handling,    setHandling]    = useState('')
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [result,      setResult]      = useState(null)

  useEffect(() => {
    supabase.from('store_settings')
      .select('key, value')
      .in('key', ['shipping_cost', 'handling_fee'])
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.key] = r.value })
        setShipping(map.shipping_cost ?? '4.99')
        setHandling(map.handling_fee  ?? '0.00')
        setLoading(false)
      })
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true); setResult(null)
    const shippingVal = parseFloat(shipping)
    const handlingVal = parseFloat(handling)
    if (isNaN(shippingVal) || isNaN(handlingVal)) {
      setResult({ ok: false, message: 'Enter valid numbers for both fields' })
      setSaving(false); return
    }
    try {
      const { error } = await supabase.from('store_settings').upsert([
        { key: 'shipping_cost', value: shippingVal.toFixed(2), updated_at: new Date().toISOString() },
        { key: 'handling_fee',  value: handlingVal.toFixed(2), updated_at: new Date().toISOString() },
      ], { onConflict: 'key' })
      if (error) throw new Error(error.message)
      setResult({ ok: true })
    } catch (err) {
      setResult({ ok: false, message: err.message })
    } finally {
      setSaving(false)
    }
  }

  const Field = ({ label, value, onChange, desc }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, overflow: 'hidden', maxWidth: 200 }}>
        <span style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 700, fontSize: '.9rem', borderRight: '1px solid rgba(255,255,255,.1)' }}>$</span>
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '10px 12px', color: '#f1f5f9', fontSize: '.95rem', fontWeight: 600 }}
        />
      </div>
      {desc && <div style={{ fontSize: '.68rem', color: '#475569' }}>{desc}</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f1f5f9', marginBottom: 4 }}>⚙️ Store Settings</div>
      <div style={{ fontSize: '.78rem', color: '#64748b', marginBottom: 24 }}>
        Changes take effect immediately on the store and checkout.
      </div>

      {loading ? (
        <div style={{ color: '#64748b', fontSize: '.85rem' }}>Loading settings…</div>
      ) : (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Shipping & Handling card */}
          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#e2e8f0', marginBottom: 4 }}>🚚 Shipping & Handling</div>
            <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 18 }}>
              Flat rate charged per order at checkout. Set to 0 for free shipping.
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <Field
                label="Shipping Cost"
                value={shipping}
                onChange={setShipping}
                desc="Standard flat-rate shipping per order"
              />
              <Field
                label="Handling Fee"
                value={handling}
                onChange={setHandling}
                desc="Added to shipping (packaging, supplies, etc.)"
              />
            </div>

            {/* Live preview */}
            <div style={{ marginTop: 18, padding: '12px 14px', background: 'rgba(201,168,76,.06)', border: '1px solid rgba(201,168,76,.15)', borderRadius: 10 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Live preview — what customers see</div>
              <div style={{ display: 'flex', gap: 16, fontSize: '.82rem' }}>
                <div style={{ color: '#94a3b8' }}>Shipping: <span style={{ color: '#c9a84c', fontWeight: 700 }}>${(parseFloat(shipping) || 0).toFixed(2)}</span></div>
                <div style={{ color: '#94a3b8' }}>Handling: <span style={{ color: '#c9a84c', fontWeight: 700 }}>${(parseFloat(handling) || 0).toFixed(2)}</span></div>
                <div style={{ color: '#94a3b8' }}>Total added: <span style={{ color: '#4ade80', fontWeight: 800 }}>${((parseFloat(shipping) || 0) + (parseFloat(handling) || 0)).toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          {result && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: '.78rem', background: result.ok ? 'rgba(74,222,128,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${result.ok ? 'rgba(74,222,128,.25)' : 'rgba(239,68,68,.25)'}`, color: result.ok ? '#4ade80' : '#fca5a5' }}>
              {result.ok ? '✓ Settings saved successfully' : `⚠️ ${result.message}`}
            </div>
          )}

          <button type="submit" disabled={saving} style={{ alignSelf: 'flex-start', padding: '11px 28px', borderRadius: 10, border: 'none', background: saving ? 'rgba(201,168,76,.4)' : '#c9a84c', color: '#000', fontWeight: 800, fontSize: '.88rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: '📊 Overview'  },
  { id: 'listings',  label: '🏪 Listings'  },
  { id: 'orders',    label: '📦 Orders'    },
  { id: 'settings',  label: '⚙️ Settings'  },
]

export default function AdminPanel({ user }) {
  const [tab,           setTab]           = useState('overview')
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [lastFetched,   setLastFetched]   = useState(null)
  const [exporting,     setExporting]     = useState(false)

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

  useEffect(() => { if (tab === 'overview') fetchStats() }, [tab, fetchStats])

  const downloadBackup = useCallback(async () => {
    setExporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not signed in')

      const res = await fetch('/.netlify/functions/export-data', {
        headers: { 'Authorization': `Bearer ${jwt}` },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `vaulted-singles-backup-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Backup failed: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }, [])

  const { totals, users, signupsByDay } = data || {}
  const engagementRate = totals
    ? Math.round((totals.usersWithCollection / Math.max(totals.users, 1)) * 100)
    : null

  return (
    <div style={{ paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 16,
        border: '1px solid rgba(99,102,241,0.25)',
        boxShadow: '0 4px 20px rgba(99,102,241,0.15)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.15em', color: '#6366f1', textTransform: 'uppercase', marginBottom: 3 }}>Admin Only</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.5px' }}>🎛️ Control Center</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tab === 'overview' && (
            <button onClick={fetchStats} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
              background: loading ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc',
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600,
            }}>
              <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>🔄</span>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          )}
          <button onClick={downloadBackup} disabled={exporting} title="Download a JSON backup of all store data" style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
            background: exporting ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)',
            border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7',
            cursor: exporting ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600,
          }}>
            {exporting ? '⏳' : '💾'} {exporting ? 'Exporting…' : 'Backup'}
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none',
              background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: tab === t.id ? '#a5b4fc' : '#64748b',
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: '.8rem', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <>
          {error && (
            <div style={{ borderRadius: 10, padding: 14, marginBottom: 16, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', fontSize: '0.85rem' }}>
              ⚠️ {error}
            </div>
          )}
          {loading && !data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ height: 100, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          )}
          {totals && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
              <StatCard icon="👤" label="Total Users"        value={totals.users}                                  color="#6366f1" />
              <StatCard icon="🆕" label="New This Week"      value={totals.newLast7d}                              color="#22c55e" sub={`${totals.newLast30d} this month`} />
              <StatCard icon="📦" label="Active Collections" value={totals.usersWithCollection}                   color="#3b82f6" sub={`${engagementRate}% of users`} />
              <StatCard icon="🃏" label="Cards Tracked"      value={totals.totalCards?.toLocaleString()}          color="#f59e0b" sub={`${totals.totalUniqueCards} unique`} />
              <StatCard icon="⚔️" label="Matches Logged"     value={totals.totalMatches?.toLocaleString()}        color="#ec4899" />
              <StatCard icon="📊" label="Engagement Rate"    value={`${engagementRate}%`}                         color="#14b8a6" sub="users with ≥1 card" />
            </div>
          )}
          {signupsByDay && <SignupChart signupsByDay={signupsByDay} />}
          {users && <UserTable users={users} />}
        </>
      )}

      {/* ── Listings tab ── */}
      {tab === 'listings' && <ListingsTab />}

      {/* ── Orders tab ── */}
      {tab === 'orders' && <OrdersTab />}

      {/* ── Settings tab ── */}
      {tab === 'settings' && <SettingsTab />}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:0.4; } 50% { opacity:0.8; } }
      `}</style>
    </div>
  )
}
