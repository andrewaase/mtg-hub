import { useState, useEffect, useRef } from 'react'
import { addCard } from '../lib/db'
import { searchScryfall, getAllPrintings } from '../lib/utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVariantLabel(card) {
  const fx = card.frame_effects || []
  if (fx.includes('extendedart'))         return 'Extended Art'
  if (fx.includes('showcase'))            return 'Showcase'
  if (fx.includes('inverted'))            return 'Retro Frame'
  if (card.border_color === 'borderless') return 'Borderless'
  if (card.full_art)                      return 'Full Art'
  if (card.textless)                      return 'Textless'
  if (card.promo_types?.includes('stamped')) return 'Prerelease'
  if (card.promo)                         return 'Promo'
  if (card.variation)                     return 'Alt Art'
  return 'Normal'
}

function cardImg(card) {
  return card.image_uris?.normal
    || card.image_uris?.small
    || card.card_faces?.[0]?.image_uris?.normal
    || card.card_faces?.[0]?.image_uris?.small
    || null
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AddCardModal({ onClose, prefill, user, collection, setCollection, showToast }) {
  // Step 1 — name search
  const [cardName,      setCardName]      = useState(prefill?.name || '')
  const [suggestions,   setSuggestions]   = useState([])
  const [showDropdown,  setShowDropdown]  = useState(false)
  const [nameConfirmed, setNameConfirmed] = useState(!!prefill?.name)

  // Step 2 — printings
  const [printings,     setPrintings]     = useState([])   // all Scryfall printings
  const [loadingPrints, setLoadingPrints] = useState(false)
  const [selectedSet,   setSelectedSet]   = useState(null) // set_name string

  // Step 3 — variant within set
  const [selectedCard,  setSelectedCard]  = useState(null) // full Scryfall card object

  // Step 4 — foil
  const [isFoil,        setIsFoil]        = useState(false)

  // Always visible
  const [qty,           setQty]           = useState(1)
  const [condition,     setCondition]     = useState('NM')

  const inputRef = useRef(null)

  // Auto-fetch printings when name is confirmed
  useEffect(() => {
    if (!nameConfirmed || !cardName) return
    setLoadingPrints(true)
    setPrintings([])
    setSelectedSet(null)
    setSelectedCard(null)
    getAllPrintings(cardName).then(data => {
      setPrintings(data)
      setLoadingPrints(false)
    })
  }, [nameConfirmed, cardName])

  // Reset foil when variant changes
  useEffect(() => {
    if (!selectedCard) return
    const finishes = selectedCard.finishes || []
    // Default to foil if it's foil-only, otherwise non-foil
    setIsFoil(finishes.length === 1 && finishes[0] === 'foil')
  }, [selectedCard])

  // ── Autocomplete ──
  useEffect(() => {
    if (nameConfirmed || cardName.length < 2) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      const res = await searchScryfall(cardName)
      setSuggestions(res.slice(0, 8))
      setShowDropdown(true)
    }, 300)
    return () => clearTimeout(t)
  }, [cardName, nameConfirmed])

  function confirmName(name) {
    setCardName(name)
    setSuggestions([])
    setShowDropdown(false)
    setNameConfirmed(true)
  }

  function resetName() {
    setCardName('')
    setNameConfirmed(false)
    setPrintings([])
    setSelectedSet(null)
    setSelectedCard(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── Derived data ──
  // Group printings by set_name, preserve first-seen order
  const setGroups = []
  const setsSeen  = new Map()
  for (const p of printings) {
    if (!setsSeen.has(p.set_name)) {
      setsSeen.set(p.set_name, [])
      setGroups.push({ setName: p.set_name, setCode: p.set, cards: [] })
    }
    setGroups.find(g => g.setName === p.set_name).cards.push(p)
  }

  const variantsInSet = selectedSet
    ? (setGroups.find(g => g.setName === selectedSet)?.cards || [])
    : []

  // Auto-select when only one variant in set
  useEffect(() => {
    if (variantsInSet.length === 1 && !selectedCard) {
      setSelectedCard(variantsInSet[0])
    }
  }, [variantsInSet.length, selectedSet]) // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = !!selectedCard

  // ── Submit ──
  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    const finishes = selectedCard.finishes || ['nonfoil']
    const price    = isFoil
      ? parseFloat(selectedCard.prices?.usd_foil)  || null
      : parseFloat(selectedCard.prices?.usd)       || null

    const card = {
      name:         selectedCard.name,
      qty:          parseInt(qty, 10) || 1,
      condition,
      isFoil:       isFoil && finishes.includes('foil'),
      setName:      selectedCard.set_name,
      img:          cardImg(selectedCard),
      colors:       selectedCard.color_identity || [],
      price,
      tcgplayerUrl: selectedCard.purchase_uris?.tcgplayer || null,
      scryfallId:   selectedCard.id || null,
    }

    try {
      const saved = await addCard(card, user?.id)
      setCollection(prev => {
        const i = prev.findIndex(c => c.scryfallId === card.scryfallId)
        if (i >= 0) {
          const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + card.qty }; return next
        }
        return [...prev, { ...card, id: saved?.id ?? Date.now() }]
      })
      showToast('Card added!')
      onClose()
    } catch (err) {
      showToast(`Save failed: ${err.message}`)
    }
  }

  // ── Foil availability for selected card ──
  const finishes        = selectedCard?.finishes || []
  const hasFoil         = finishes.includes('foil')
  const hasNonFoil      = finishes.includes('nonfoil')
  const foilOnly        = hasFoil && !hasNonFoil
  const foilUsd         = selectedCard ? parseFloat(selectedCard.prices?.usd_foil) || null : null
  const nonFoilUsd      = selectedCard ? parseFloat(selectedCard.prices?.usd)      || null : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ marginBottom: '16px' }}>+ Add Card to Collection</h3>

        <form onSubmit={handleSubmit}>

          {/* ── Step 1: Card name ── */}
          <div className="form-group" style={{ position: 'relative', marginBottom: '16px' }}>
            <label className="form-label">Card Name</label>
            {nameConfirmed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  fontSize: '.88rem', color: 'var(--text-primary)', fontWeight: 600,
                }}>
                  {cardName}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetName} style={{ flexShrink: 0 }}>
                  ✕ Change
                </button>
              </div>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="text"
                  className="form-input"
                  value={cardName}
                  onChange={e => { setCardName(e.target.value); setNameConfirmed(false) }}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onKeyDown={e => { if (e.key === 'Enter' && cardName.trim()) { e.preventDefault(); confirmName(cardName.trim()) } }}
                  placeholder="Search Scryfall…"
                  autoComplete="off"
                  autoFocus={!prefill?.name}
                />
                {showDropdown && suggestions.length > 0 && (
                  <div className="ac-dropdown">
                    {suggestions.map(name => (
                      <div key={name} className="ac-item" onMouseDown={() => confirmName(name)}>
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Step 2: Set selector ── */}
          {nameConfirmed && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">
                Set
                {loadingPrints && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>loading…</span>}
              </label>
              {!loadingPrints && setGroups.length > 0 && (
                <select
                  className="form-select"
                  value={selectedSet || ''}
                  onChange={e => {
                    setSelectedSet(e.target.value || null)
                    setSelectedCard(null)
                  }}
                >
                  <option value="">— Choose a set —</option>
                  {setGroups.map(g => (
                    <option key={g.setName} value={g.setName}>
                      {g.setName}{g.cards.length > 1 ? ` (${g.cards.length} variants)` : ''}
                    </option>
                  ))}
                </select>
              )}
              {!loadingPrints && setGroups.length === 0 && nameConfirmed && (
                <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>No printings found.</div>
              )}
            </div>
          )}

          {/* ── Step 3: Variant picker ── */}
          {selectedSet && variantsInSet.length > 0 && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">
                Printing / Version
                {variantsInSet.length === 1 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>auto-selected</span>}
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fill, minmax(${variantsInSet.length === 1 ? '120px' : '100px'}, 1fr))`,
                gap: '8px',
              }}>
                {variantsInSet.map(card => {
                  const img     = cardImg(card)
                  const label   = getVariantLabel(card)
                  const price   = parseFloat(card.prices?.usd) || null
                  const isSelected = selectedCard?.id === card.id
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCard(card)}
                      style={{
                        background:   isSelected ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                        border:       `2px solid ${isSelected ? 'var(--accent-teal)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding:      '6px',
                        cursor:       'pointer',
                        textAlign:    'center',
                        transition:   'border-color .15s',
                      }}
                    >
                      {img
                        ? <img src={img} alt={card.name} style={{ width: '100%', borderRadius: '4px', display: 'block', marginBottom: '4px' }} />
                        : <div style={{ width: '100%', paddingBottom: '140%', background: 'var(--bg-secondary)', borderRadius: '4px', marginBottom: '4px' }} />
                      }
                      <div style={{ fontSize: '.62rem', color: isSelected ? 'var(--accent-teal)' : 'var(--text-muted)', lineHeight: 1.3, fontWeight: isSelected ? 700 : 400 }}>
                        {label}
                      </div>
                      {price != null && (
                        <div style={{ fontSize: '.6rem', color: 'var(--accent-gold)', marginTop: '2px' }}>
                          ${price.toFixed(2)}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Foil toggle ── */}
          {selectedCard && (hasFoil || hasNonFoil) && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Finish</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {hasNonFoil && (
                  <button
                    type="button"
                    onClick={() => setIsFoil(false)}
                    style={{
                      flex: 1, padding: '8px',
                      background: !isFoil ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                      border: `2px solid ${!isFoil ? 'var(--accent-teal)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)', cursor: 'pointer',
                      color: !isFoil ? 'var(--accent-teal)' : 'var(--text-muted)',
                      fontSize: '.82rem', fontWeight: !isFoil ? 700 : 400,
                    }}
                  >
                    Non-Foil{nonFoilUsd != null ? ` · $${nonFoilUsd.toFixed(2)}` : ''}
                  </button>
                )}
                {hasFoil && (
                  <button
                    type="button"
                    onClick={() => setIsFoil(true)}
                    style={{
                      flex: 1, padding: '8px',
                      background: isFoil ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                      border: `2px solid ${isFoil ? '#a78bfa' : 'var(--border)'}`,
                      borderRadius: 'var(--radius)', cursor: 'pointer',
                      color: isFoil ? '#a78bfa' : 'var(--text-muted)',
                      fontSize: '.82rem', fontWeight: isFoil ? 700 : 400,
                    }}
                  >
                    ✦ Foil{foilUsd != null ? ` · $${foilUsd.toFixed(2)}` : ''}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Qty + Condition ── */}
          <div className="grid-2 gap-12" style={{ marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number" className="form-input"
                value={qty} onChange={e => setQty(e.target.value)} min="1"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select className="form-select" value={condition} onChange={e => setCondition(e.target.value)}>
                <option>NM</option>
                <option>LP</option>
                <option>MP</option>
                <option>HP</option>
              </select>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              Add Card
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
