import { useState, useEffect, useRef } from 'react'

// SetTracker — shows how many cards from a given set you own.
// Fetches card list from Scryfall; cross-references against the user's collection.

export default function SetTracker({ collection }) {
  const [query,     setQuery]     = useState('')
  const [sets,      setSets]      = useState([])      // all Scryfall sets (lazy-loaded)
  const [filtered,  setFiltered]  = useState([])
  const [showDrop,  setShowDrop]  = useState(false)
  const [selSet,    setSelSet]    = useState(null)    // { code, name, card_count }
  const [setCards,  setSetCards]  = useState([])      // all cards in selected set
  const [loading,   setLoading]   = useState(false)
  const [view,      setView]      = useState('all')   // 'all' | 'owned' | 'missing'
  const setsLoadedRef = useRef(false)
  const dropRef       = useRef(null)

  // Lazy-load sets list on first focus
  async function ensureSetsLoaded() {
    if (setsLoadedRef.current) return
    try {
      const res  = await fetch('https://api.scryfall.com/sets')
      const data = await res.json()
      const relevant = (data.data || []).filter(s =>
        ['core','expansion','masters','draft_innovation','commander','funny','planechase','archenemy','memorabilia','token']
          .includes(s.set_type)
      ).sort((a, b) => new Date(b.released_at) - new Date(a.released_at))
      setSets(relevant)
      setsLoadedRef.current = true
    } catch { /* ignore */ }
  }

  // Filter sets by query
  useEffect(() => {
    if (!query) { setFiltered([]); return }
    const q = query.toLowerCase()
    setFiltered(
      sets.filter(s =>
        s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
      ).slice(0, 8)
    )
  }, [query, sets])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fetch all cards in the selected set (handles pagination, max 500 cards)
  async function loadSet(setObj) {
    setSelSet(setObj)
    setSetCards([])
    setLoading(true)
    setShowDrop(false)
    setQuery(setObj.name)
    setView('all')

    const cards = []
    let url = `https://api.scryfall.com/cards/search?q=set:${setObj.code}&unique=cards&order=number&page=1`

    for (let page = 0; page < 5 && url; page++) {
      try {
        const res  = await fetch(url)
        if (!res.ok) break
        const data = await res.json()
        cards.push(...(data.data || []))
        url = data.has_more ? data.next_page : null
      } catch { break }
    }

    setSetCards(cards)
    setLoading(false)
  }

  // Cross-reference set cards with collection
  const ownedNames = new Set(collection.map(c => c.name.toLowerCase()))
  const owned   = setCards.filter(c => ownedNames.has(c.name.toLowerCase()))
  const missing = setCards.filter(c => !ownedNames.has(c.name.toLowerCase()))
  const pct     = setCards.length > 0 ? Math.round((owned.length / setCards.length) * 100) : 0

  const missingValue = missing.reduce((s, c) => s + (parseFloat(c.prices?.usd) || 0), 0)

  const displayCards = view === 'owned'
    ? owned
    : view === 'missing'
      ? missing
      : setCards

  return (
    <div>
      {/* Set search */}
      <div ref={dropRef} style={{ position: 'relative', maxWidth: '380px', marginBottom: '16px' }}>
        <input
          className="form-input"
          placeholder="Search sets (e.g. Phyrexia, BRO, MH3)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { ensureSetsLoaded(); if (filtered.length > 0) setShowDrop(true) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && filtered.length > 0) setShowDrop(true)
            if (e.key === 'Escape') setShowDrop(false)
          }}
        />
        {showDrop && filtered.length > 0 && (
          <div className="ac-dropdown">
            {filtered.map(s => (
              <div key={s.code} className="ac-item" onClick={() => loadSet(s)}>
                <span style={{ fontWeight: 600, marginRight: '8px', color: 'var(--accent-gold)' }}>
                  {s.code.toUpperCase()}
                </span>
                <span className="ac-name">{s.name}</span>
                <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                  {s.card_count} cards
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <div className="spinner" />
          Loading {selSet?.name}…
        </div>
      )}

      {/* Results */}
      {!loading && selSet && setCards.length > 0 && (
        <>
          {/* Progress bar */}
          <div className="card mb-16">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{selSet.name}</div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent-teal)' }}>
                {pct}%
              </div>
            </div>

            {/* Progress track */}
            <div style={{ height: '8px', background: 'var(--bg-primary)', borderRadius: '99px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{
                height: '100%', borderRadius: '99px',
                width: `${pct}%`,
                background: pct === 100
                  ? 'var(--accent-gold)'
                  : pct > 50 ? 'var(--accent-teal)' : 'var(--accent-blue)',
                transition: 'width .6s cubic-bezier(.4,0,.2,1)',
              }} />
            </div>

            <div style={{ display: 'flex', gap: '16px', fontSize: '.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span><strong style={{ color: 'var(--accent-green)' }}>{owned.length}</strong> owned</span>
              <span><strong style={{ color: 'var(--accent-red)' }}>{missing.length}</strong> missing</span>
              {missingValue > 0 && (
                <span>Missing value: <strong style={{ color: 'var(--accent-gold)' }}>
                  ${missingValue.toFixed(2)}
                </strong></span>
              )}
            </div>
          </div>

          {/* View filter */}
          <div className="tabs" style={{ marginBottom: '16px' }}>
            {[['all', `All (${setCards.length})`], ['owned', `Owned (${owned.length})`], ['missing', `Missing (${missing.length})`]].map(([id, label]) => (
              <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
                {label}
              </button>
            ))}
          </div>

          {/* Card grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
            {displayCards.map(card => {
              const isOwned = ownedNames.has(card.name.toLowerCase())
              const img = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small
              return (
                <div key={card.id} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden' }}>
                  {img
                    ? <img
                        src={img}
                        alt={card.name}
                        style={{
                          width: '100%', display: 'block', borderRadius: '8px',
                          opacity: isOwned ? 1 : 0.28,
                          filter: isOwned ? 'none' : 'grayscale(60%)',
                          transition: 'opacity .2s',
                        }}
                        title={`${card.name} — #${card.collector_number} — ${card.prices?.usd ? '$' + card.prices.usd : 'no price'}`}
                      />
                    : <div style={{
                        height: '100px', background: 'var(--bg-card)', borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '4px',
                        opacity: isOwned ? 1 : 0.4,
                      }}>
                        {card.name}
                      </div>
                  }
                  {isOwned && (
                    <div style={{
                      position: 'absolute', bottom: '4px', right: '4px',
                      background: 'rgba(62,207,178,.85)', borderRadius: '99px',
                      width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.6rem', fontWeight: 800, color: '#0a1a16',
                    }}>✓</div>
                  )}
                  {!isOwned && card.prices?.usd && (
                    <div style={{
                      position: 'absolute', bottom: '4px', left: '4px',
                      background: 'rgba(0,0,0,.7)', borderRadius: '4px',
                      padding: '1px 5px', fontSize: '.55rem', color: 'var(--accent-gold)', fontWeight: 700,
                    }}>${card.prices.usd}</div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {!loading && !selSet && (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <div className="empty-icon">🗺️</div>
          <p>Search for a set above to see your completion progress.</p>
        </div>
      )}
    </div>
  )
}
