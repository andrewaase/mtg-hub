import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { searchScryfall, getCardDetails, getAllPrintings } from '../lib/utils'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { getManaPoolLink } from '../lib/manapool'
import { supabase, hasSupabase } from '../lib/supabase'
import { addWishlistItem } from '../lib/db'

// ── Rarity helpers ─────────────────────────────────────────────────────────────
const RARITY_ORDER  = { mythic: 0, rare: 1, uncommon: 2, common: 3, special: 4, bonus: 5 }
const RARITY_COLOR  = { mythic: '#f97316', rare: '#c9a84c', uncommon: '#94a3b8', common: '#6b7280' }
const RARITY_LABEL  = { mythic: 'Mythic Rare', rare: 'Rare', uncommon: 'Uncommon', common: 'Common', special: 'Special', bonus: 'Bonus' }

// ── Tiny helpers ───────────────────────────────────────────────────────────────
const BG    = '#000'
const ROW   = '#111'
const DIVID = '#1a1a1a'
const MUTED = '#555'
const WHITE = '#f0f0f0'

function SortChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', borderRadius: '99px', fontSize: '.74rem', fontWeight: 600,
      cursor: 'pointer', border: '1px solid',
      background: active ? '#fff' : 'transparent',
      color:      active ? '#000' : '#888',
      borderColor: active ? '#fff' : '#2a2a2a',
    }}>
      {label}
    </button>
  )
}

function SetIcon({ uri, size = 22 }) {
  if (!uri) return <div style={{ width: size, height: size, background: '#1a1a1a', borderRadius: '4px', flexShrink: 0 }} />
  return <img src={uri} alt="" style={{ width: size, height: size, filter: 'invert(1) opacity(0.6)', flexShrink: 0 }} />
}

// ── Wishlist helper ────────────────────────────────────────────────────────────
async function addCardToWishlist(card, showToast, user) {
  try {
    await addWishlistItem({
      name:         card.name,
      currentPrice: parseFloat(card.prices?.usd) || null,
      targetPrice:  null,
      addedAt:      new Date().toISOString(),
      img:          card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
      setName:      card.set_name || null,
    }, user?.id)
    showToast(`🎯 ${card.name} added to wishlist!`)
  } catch (err) {
    if (err.message?.toLowerCase().includes('duplicate') || err.message?.toLowerCase().includes('unique')) {
      showToast(`${card.name} is already on your wishlist`)
    } else {
      showToast('Could not save to wishlist')
    }
  }
}

// ── Printing thumbnail card (horizontal scroll) ────────────────────────────────
function PrintingCard({ printing, isSelected, onSelect }) {
  const img   = printing.image_uris?.small || printing.card_faces?.[0]?.image_uris?.small
  const price = printing.prices?.usd
  const foil  = printing.prices?.usd_foil
  const hasPrice = price || foil

  // Describe art treatment if it differs from normal frame
  const frame = printing.frame_effects?.length
    ? printing.frame_effects[0].replace(/_/g, ' ')
    : printing.border_color === 'borderless' ? 'borderless'
    : null

  return (
    <div
      onClick={() => onSelect(printing)}
      style={{
        flexShrink: 0, width: 136, cursor: 'pointer',
        borderRadius: '8px', overflow: 'hidden',
        border: isSelected ? '2px solid var(--accent-gold)' : '2px solid transparent',
        background: '#111',
        transition: 'border-color .15s, opacity .15s',
        opacity: isSelected ? 1 : 0.75,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.opacity = '1' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.opacity = '0.75' }}
    >
      {/* Card image */}
      {img
        ? <img src={img} alt="" style={{ width: '100%', display: 'block', borderRadius: '6px 6px 0 0' }} />
        : <div style={{ width: '100%', aspectRatio: '0.716', background: '#1a1a1a', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🃏</div>
      }

      {/* Info below image */}
      <div style={{ padding: '7px 8px 8px' }}>
        {/* Set row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '4px' }}>
          <img
            src={`https://svgs.scryfall.io/sets/${printing.set}.svg`}
            alt=""
            style={{ width: '11px', height: '11px', filter: 'invert(1) opacity(0.4)', flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none' }}
          />
          <span style={{ fontSize: '.62rem', color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {printing.set?.toUpperCase()} #{printing.collector_number}
          </span>
        </div>

        {/* Art treatment label */}
        {frame && (
          <div style={{ fontSize: '.55rem', color: '#3b82f6', textTransform: 'capitalize', marginBottom: '3px', fontWeight: 600 }}>
            {frame}
          </div>
        )}

        {/* Prices */}
        {hasPrice ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {price && (
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                ${price}
              </div>
            )}
            {foil && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ fontSize: '.6rem' }}>✨</span>
                <span style={{ fontSize: '.72rem', fontWeight: 600, color: '#7dd3fc' }}>${foil}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '.72rem', color: '#2a2a2a' }}>—</div>
        )}
      </div>
    </div>
  )
}

// ── Card Detail View ───────────────────────────────────────────────────────────
function CardDetailView({ card, printings, printingsLoading, onBack, openAddCard, showToast, onPrintingSelect, user, onStoreSearch }) {
  const rc  = RARITY_COLOR[card.rarity] || MUTED
  const img = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal
  const setIconUrl = card.set ? `https://svgs.scryfall.io/sets/${card.set}.svg` : null

  // Check if this card is available in the Vaulted Singles store
  const [storeListing, setStoreListing] = useState(null)
  useEffect(() => {
    if (!hasSupabase) return
    setStoreListing(null)
    supabase.from('store_listings')
      .select('id, price, qty_available, condition, is_foil')
      .eq('name', card.name)
      .eq('active', true)
      .gt('qty_available', 0)
      .order('price', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setStoreListing(data || null))
  }, [card.name])

  // Alternate arts = all printings except the current one
  const altPrintings = printings.filter(p => p.id !== card.id)
  const showPrintings = !printingsLoading && printings.length > 1

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: `1px solid ${DIVID}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: '1rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '2px' }}>
          ‹ Back
        </button>
        <div style={{ flex: 1, fontWeight: 700, color: WHITE, fontSize: '.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
        {setIconUrl && (
          <img src={setIconUrl} alt="" style={{ width: '22px', height: '22px', filter: 'invert(1) opacity(0.55)', flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
      </div>

      {/* Card image */}
      {img && (
        <div style={{ padding: '20px 0 12px', display: 'flex', justifyContent: 'center' }}>
          <img src={img} alt={card.name} style={{ width: 'min(280px, 72vw)', borderRadius: '14px', boxShadow: '0 12px 60px rgba(0,0,0,.9)' }} />
        </div>
      )}

      {/* Core info */}
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ fontSize: '.8rem', color: '#888', marginBottom: '5px' }}>{card.type_line}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.72rem', color: rc }}>{RARITY_LABEL[card.rarity] || card.rarity}</span>
          {card.set && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '.72rem', color: MUTED }}>
              ·
              {setIconUrl && (
                <img src={setIconUrl} alt="" style={{ width: '13px', height: '13px', filter: 'invert(1) opacity(0.45)', verticalAlign: 'middle' }}
                  onError={e => { e.target.style.display = 'none' }} />
              )}
              {card.set.toUpperCase()} #{card.collector_number}
            </span>
          )}
        </div>
      </div>

      {/* Price strip */}
      <div style={{ display: 'flex', gap: '1px', margin: '12px 16px', borderRadius: '12px', overflow: 'hidden' }}>
        {[['Normal', card.prices?.usd], ['Foil', card.prices?.usd_foil], ['EUR', card.prices?.eur]].map(([label, val]) => (
          <div key={label} style={{ flex: 1, background: '#111', padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: '.58rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
            <div style={{ fontSize: '.95rem', fontWeight: 700, color: val ? 'var(--accent-gold)' : '#2a2a2a', marginTop: '4px' }}>
              {val ? `$${val}` : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Oracle text */}
      {card.oracle_text && (
        <div style={{ margin: '0 16px 16px', background: '#0d0d0d', border: `1px solid ${DIVID}`, borderRadius: '10px', padding: '12px 14px', fontSize: '.82rem', color: '#888', lineHeight: 1.7 }}>
          {card.oracle_text}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Buy from Vaulted Singles — only shown when in stock */}
        {storeListing && (
          <button
            onClick={() => onStoreSearch?.(card.name)}
            style={{
              width: '100%', padding: '13px',
              background: 'linear-gradient(135deg, #c9a84c, #f0c060)',
              color: '#000', border: 'none', borderRadius: '12px',
              fontWeight: 800, fontSize: '.9rem', cursor: 'pointer', letterSpacing: '.3px',
            }}
          >
            🏪 Buy from Vaulted Singles — ${storeListing.price?.toFixed(2)}
            {storeListing.is_foil ? ' ✨' : ''}
            {storeListing.condition && storeListing.condition !== 'NM' ? ` (${storeListing.condition})` : ''}
          </button>
        )}

        <button onClick={() => openAddCard(card)} style={{
          width: '100%', padding: '13px', background: 'var(--accent-gold)', color: '#000',
          border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer',
          letterSpacing: '.3px',
        }}>
          + Add to Collection
        </button>
        <button onClick={() => addCardToWishlist(card, showToast, user)} style={{
          width: '100%', padding: '13px', background: 'transparent', color: '#aaa',
          border: `1px solid #2a2a2a`, borderRadius: '12px', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
        }}>
          🎯 Add to Wishlist
        </button>
        <a
          href={getTCGPlayerLink(card.purchase_uris?.tcgplayer || card.name)}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'block', width: '100%', padding: '13px',
            background: '#1a4e2e', color: '#4ade80',
            border: '1px solid #2a6e42', borderRadius: '12px',
            fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
            textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box',
          }}
        >
          🛒 Buy on TCGPlayer
        </a>
        <a
          href={getManaPoolLink(card)}
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'block', width: '100%', padding: '13px',
            background: '#0f2a3a', color: '#38bdf8',
            border: '1px solid #1e4a6a', borderRadius: '12px',
            fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
            textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box',
          }}
        >
          🌊 Buy on ManaPool
        </a>
      </div>

      {/* ── Other Printings / Alternate Arts ── */}
      {printingsLoading && (
        <div style={{ padding: '16px', textAlign: 'center', color: MUTED, fontSize: '.75rem' }}>
          Loading alternate printings…
        </div>
      )}

      {showPrintings && (
        <div style={{ paddingBottom: '32px' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 16px 12px' }}>
            <div style={{ flex: 1, height: '1px', background: DIVID }} />
            <div style={{ fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#333', flexShrink: 0 }}>
              {printings.length} printing{printings.length !== 1 ? 's' : ''} · tap to switch
            </div>
            <div style={{ flex: 1, height: '1px', background: DIVID }} />
          </div>

          {/* Horizontal scroll row */}
          <div style={{
            display: 'flex', gap: '10px', overflowX: 'auto',
            padding: '0 16px 4px',
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}>
            {printings.map(p => (
              <PrintingCard
                key={p.id}
                printing={p}
                isSelected={p.id === card.id}
                onSelect={onPrintingSelect}
              />
            ))}
          </div>

          {/* Scryfall link */}
          <div style={{ padding: '12px 16px 0', textAlign: 'right' }}>
            <a
              href={card.scryfall_uri || `https://scryfall.com/card/${card.set}/${card.collector_number}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '.7rem', color: '#333', textDecoration: 'none' }}
            >
              View on Scryfall ↗
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Set Card List View ─────────────────────────────────────────────────────────
function SetView({ set, onBack, onCardSelect }) {
  const [cards, setCards]   = useState([])
  const [loading, setLoad]  = useState(true)
  const [sortBy, setSortBy] = useState('price')
  const [hasMore, setHasMore] = useState(false)
  const [nextPage, setNextPage] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    setLoad(true)
    setCards([])
    fetch(`https://api.scryfall.com/cards/search?q=set:${set.code}&order=usd&unique=cards&dir=desc`)
      .then(r => r.json())
      .then(data => {
        if (data.data) {
          setCards(data.data)
          setHasMore(data.has_more || false)
          setNextPage(data.next_page || null)
        }
      })
      .catch(() => {})
      .finally(() => setLoad(false))
  }, [set.code])

  const loadMore = async () => {
    if (!nextPage || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(nextPage)
      const data = await res.json()
      if (data.data) {
        setCards(prev => [...prev, ...data.data])
        setHasMore(data.has_more || false)
        setNextPage(data.next_page || null)
      }
    } catch {}
    setLoadingMore(false)
  }

  const sorted = useMemo(() => {
    const arr = [...cards]
    if (sortBy === 'price')   return arr.sort((a, b) => (parseFloat(b.prices?.usd) || 0) - (parseFloat(a.prices?.usd) || 0))
    if (sortBy === 'az')      return arr.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'rarity')  return arr.sort((a, b) => (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9))
    if (sortBy === 'number')  return arr.sort((a, b) => parseInt(a.collector_number || 0) - parseInt(b.collector_number || 0))
    return arr
  }, [cards, sortBy])

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: `1px solid ${DIVID}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: '1rem', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
          ‹ Back
        </button>
        <div style={{ flex: 1, fontWeight: 700, color: WHITE, fontSize: '.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {set.name}
        </div>
        <SetIcon uri={set.icon_svg_uri} />
      </div>

      {/* Sort chips */}
      <div style={{ display: 'flex', gap: '6px', padding: '10px 16px', borderBottom: `1px solid ${DIVID}`, overflowX: 'auto' }}>
        {[['az','A-Z'], ['price','Price'], ['rarity','Rarity'], ['number','Card #']].map(([val, label]) => (
          <SortChip key={val} label={label} active={sortBy === val} onClick={() => setSortBy(val)} />
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '.7rem', color: MUTED, alignSelf: 'center', flexShrink: 0 }}>
          {cards.length} cards
        </div>
      </div>

      {/* Card rows */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: MUTED, fontSize: '.85rem' }}>Loading cards…</div>
      ) : (
        <>
          {sorted.map(card => (
            <div
              key={card.id}
              onClick={() => onCardSelect(card)}
              style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: `1px solid #0f0f0f`, cursor: 'pointer', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = ROW}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#e8e8e8', fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {card.name}
                </div>
                <div style={{ fontSize: '.7rem', color: RARITY_COLOR[card.rarity] || MUTED, marginTop: '2px' }}>
                  {RARITY_LABEL[card.rarity] || card.rarity}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: card.prices?.usd ? WHITE : '#2a2a2a', fontSize: '.88rem', marginLeft: '14px', flexShrink: 0 }}>
                {card.prices?.usd ? `$${card.prices.usd}` : '—'}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <button onClick={loadMore} disabled={loadingMore} style={{
                background: 'transparent', border: `1px solid #2a2a2a`, color: '#888',
                padding: '8px 24px', borderRadius: '99px', fontSize: '.78rem', cursor: 'pointer',
              }}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Search View ────────────────────────────────────────────────────────────────
function SearchView({ onBack, onCardSelect }) {
  const [query, setQuery]           = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDrop, setShowDrop]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      const r = await searchScryfall(query)
      setSuggestions(r.slice(0, 10))
      setShowDrop(true)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const pick = (name) => {
    setQuery(name)
    setShowDrop(false)
    onCardSelect(name)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && query) pick(query)
    if (e.key === 'Escape') onBack()
  }

  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {/* Search bar header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: `1px solid ${DIVID}` }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: '1rem', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
          ‹ Back
        </button>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search all MTG cards…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            onFocus={() => suggestions.length > 0 && setShowDrop(true)}
            style={{
              width: '100%', background: '#111', border: `1px solid #222`,
              borderRadius: '8px', padding: '9px 14px', color: WHITE,
              fontSize: '.9rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {/* Dropdown */}
          {showDrop && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: '#111', border: `1px solid #222`, borderRadius: '10px',
              zIndex: 200, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,.8)',
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s}
                  onClick={() => pick(s)}
                  style={{ padding: '11px 16px', cursor: 'pointer', color: '#ddd', fontSize: '.88rem', borderBottom: i < suggestions.length - 1 ? `1px solid #1a1a1a` : 'none', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#1a1a1a'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>
        {query && (
          <button onClick={() => { setQuery(''); setSuggestions([]); inputRef.current?.focus() }}
            style={{ background: 'none', border: 'none', color: MUTED, fontSize: '1.1rem', cursor: 'pointer', padding: '0 2px' }}>
            ✕
          </button>
        )}
      </div>

      {loading && <div style={{ padding: '40px', textAlign: 'center', color: MUTED }}>Searching…</div>}

      {!loading && query.length < 2 && (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔍</div>
          <div style={{ color: MUTED, fontSize: '.85rem' }}>Type a card name to search across all MTG sets</div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
// ── Recently viewed helpers ────────────────────────────────────────────────────
const RV_KEY   = 'vs-recently-viewed'
const RV_MAX   = 8

function loadRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem(RV_KEY) || '[]') } catch { return [] }
}

function saveRecentlyViewed(card) {
  try {
    const existing = loadRecentlyViewed().filter(c => c.id !== card.id)
    const entry = {
      id:    card.id,
      name:  card.name,
      img:   card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || null,
      price: card.prices?.usd || null,
      set:   card.set_name || null,
    }
    const updated = [entry, ...existing].slice(0, RV_MAX)
    localStorage.setItem(RV_KEY, JSON.stringify(updated))
    return updated
  } catch { return [] }
}

// ── sessionStorage helpers for persisting open-card state across remounts ─────
const SS_VIEW   = 'vs-cl-view'
const SS_CARD   = 'vs-cl-card'
function ssGetView()   { try { return sessionStorage.getItem(SS_VIEW) || 'home' } catch { return 'home' } }
function ssGetCard()   { try { const s = sessionStorage.getItem(SS_CARD); return s ? JSON.parse(s) : null } catch { return null } }
function ssSaveView(v) { try { sessionStorage.setItem(SS_VIEW, v) } catch {} }
function ssSaveCard(c) { try { if (c) sessionStorage.setItem(SS_CARD, JSON.stringify(c)); else sessionStorage.removeItem(SS_CARD) } catch {} }

// ── Sealed product definitions ─────────────────────────────────────────────────
const SEALED_PRODUCTS = [
  {
    id: 'play',
    name: 'Play Booster',
    sub: 'The standard booster since 2024',
    emoji: '🎴',
    bg: 'linear-gradient(145deg, #10103a 0%, #1e1470 55%, #0c1e3a 100%)',
    accent: '#818cf8',
    count: '14 cards',
    bullets: [
      '6–7 Commons',
      '3 Uncommons',
      '1 guaranteed Rare or Mythic Rare',
      '1 Land (may be full-art or non-basic)',
      '1 Wildcard slot — foil, showcase, or bonus rare',
    ],
    bestFor: 'Drafting & Collecting',
  },
  {
    id: 'collector',
    name: 'Collector Booster',
    sub: 'Premium foils & exclusive treatments',
    emoji: '✨',
    bg: 'linear-gradient(145deg, #1c1200 0%, #3a2600 55%, #1a1600 100%)',
    accent: '#f0c060',
    count: '15 cards',
    bullets: [
      '3–5 Rares & Mythic Rares',
      'Extended art & borderless versions',
      'Showcase alternate-frame treatments',
      'Serialized 1/500 cards in select sets',
      'Every card is premium foil',
    ],
    bestFor: 'Collectors & Investors',
  },
  {
    id: 'commander',
    name: 'Commander Deck',
    sub: 'Ready to play straight out of the box',
    emoji: '⚔️',
    bg: 'linear-gradient(145deg, #081808 0%, #0e320e 55%, #081a18 100%)',
    accent: '#4ade80',
    count: '100 cards',
    bullets: [
      '100 curated cards for Commander format',
      '2–15 brand-new cards exclusive to the deck',
      'Foil-etched legendary commander',
      'Double-sided tokens',
      'Strategy insert included',
    ],
    bestFor: 'Commander Format',
  },
  {
    id: 'bundle',
    name: 'Bundle',
    sub: 'Best value way into a new set',
    emoji: '📦',
    bg: 'linear-gradient(145deg, #081420 0%, #0d2040 55%, #081a10 100%)',
    accent: '#38bdf8',
    count: '8 Boosters + extras',
    bullets: [
      '8 Play Boosters (112+ cards total)',
      '40 full-art basic lands',
      '1 exclusive foil promo rare',
      'Spindown life counter die',
      'Sturdy storage box',
    ],
    bestFor: 'New Players & Value',
  },
  {
    id: 'secret-lair',
    name: 'Secret Lair',
    sub: 'Limited drops, stunning alternate art',
    emoji: '🌟',
    bg: 'linear-gradient(145deg, #1a0012 0%, #3a0025 55%, #100030 100%)',
    accent: '#e879f9',
    count: '5–15 cards',
    bullets: [
      'Reprints of iconic cards with new art only',
      'Top-tier artist & crossover collaborations',
      'Foil & non-foil editions available',
      'Limited-window availability',
      'No pack randomness — you see what you get',
    ],
    bestFor: 'Art Lovers & Collectors',
  },
  {
    id: 'prerelease',
    name: 'Prerelease Pack',
    sub: 'Play the new set a week early',
    emoji: '🎉',
    bg: 'linear-gradient(145deg, #1a0e00 0%, #3a2000 55%, #1a1800 100%)',
    accent: '#fbbf24',
    count: '6 Boosters + promo',
    bullets: [
      '6 Play Boosters for the new set',
      '1 date-stamped foil promo rare',
      'Exclusive prerelease stamp on promo',
      'Only available at local game stores',
      'Sealed deck / draft event ready',
    ],
    bestFor: 'LGS Events',
  },
]

// ── Product card tile (sealed products section) ────────────────────────────────
function ProductCard({ product }) {
  return (
    <div style={{
      flexShrink: 0,
      width: 220,
      borderRadius: 16,
      background: product.bg,
      border: '1px solid rgba(255,255,255,.05)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Hero */}
      <div style={{ padding: '20px 18px 16px', position: 'relative' }}>
        {/* Soft glow behind emoji */}
        <div style={{
          position: 'absolute', top: 8, left: 12,
          width: 64, height: 64,
          background: `radial-gradient(circle, ${product.accent}50 0%, transparent 70%)`,
          filter: 'blur(14px)',
          pointerEvents: 'none',
        }} />
        <div style={{ fontSize: '2.4rem', marginBottom: 10, position: 'relative' }}>{product.emoji}</div>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#f0f0f0', position: 'relative' }}>{product.name}</div>
        <div style={{ fontSize: '.68rem', color: product.accent, marginTop: 2, position: 'relative', lineHeight: 1.3 }}>{product.sub}</div>
        <div style={{
          marginTop: 10, display: 'inline-flex', alignItems: 'center',
          background: `${product.accent}20`, border: `1px solid ${product.accent}40`,
          borderRadius: 99, padding: '3px 10px',
          fontSize: '.65rem', fontWeight: 700, color: product.accent, position: 'relative',
        }}>
          {product.count}
        </div>
      </div>

      {/* Thin accent divider */}
      <div style={{ height: 1, background: `linear-gradient(to right, transparent, ${product.accent}35, transparent)` }} />

      {/* What's inside */}
      <div style={{ padding: '14px 18px 10px', flex: 1 }}>
        <div style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.9px', color: '#444', marginBottom: 9 }}>
          What's Inside
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {product.bullets.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: product.accent, flexShrink: 0, marginTop: 5,
              }} />
              <span style={{ fontSize: '.73rem', color: '#bbb', lineHeight: 1.4 }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 18px 14px',
        borderTop: `1px solid ${product.accent}20`,
        background: `${product.accent}08`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#555' }}>Best for</span>
        <span style={{ fontSize: '.72rem', fontWeight: 700, color: product.accent }}>{product.bestFor}</span>
      </div>
    </div>
  )
}

export default function CardLookup({ showToast, openAddCard, initialSearch = '', onSearchUsed, user, openStoreSearch }) {
  const [view, setViewRaw]        = useState(ssGetView)  // restore from sessionStorage on mount
  const [sets, setSets]           = useState([])
  const [secretLairs, setSecretLairs] = useState([])
  const [setsLoading, setSetsLoad] = useState(true)
  const [setSearch, setSetSearch] = useState('')
  const [selectedSet, setSelSet]  = useState(null)
  const [cardDetail, setCardDetailRaw] = useState(ssGetCard)  // restore from sessionStorage on mount
  const [printings, setPrintings]  = useState([])
  const [printLoad, setPrintLoad]  = useState(false)
  const [recentCards, setRecentCards] = useState(loadRecentlyViewed)
  const prevView = useRef(ssGetView() === 'card' ? 'home' : ssGetView())

  // Wrappers that persist to sessionStorage so open-card state survives any remount
  const setView = useCallback((v) => { setViewRaw(v); ssSaveView(v) }, [])
  const setCardDetail = useCallback((c) => { setCardDetailRaw(c); ssSaveCard(c) }, [])

  // Incoming card from Dashboard (random card or format staple tap)
  useEffect(() => {
    if (window.__randomCard) {
      const card = window.__randomCard
      window.__randomCard = null
      openCardDetail(card)
    } else if (window.__lookupCardName) {
      const name = window.__lookupCardName
      window.__lookupCardName = null
      openCardDetail(name) // openCardDetail already handles plain string names
    }
  }, []) // eslint-disable-line

  // Incoming card from deck builder — jump straight to card detail
  useEffect(() => {
    if (initialSearch) {
      onSearchUsed?.()
      openCardDetail(initialSearch)
    }
  }, [initialSearch]) // eslint-disable-line

  // Load MTG paper sets — all of them
  useEffect(() => {
    setSetsLoad(true)
    fetch('https://api.scryfall.com/sets')
      .then(r => r.json())
      .then(data => {
        const all = data.data || []

        // Main paper sets: broad type list covers every physical product line
        const MAIN_TYPES = new Set([
          'expansion', 'core', 'masters', 'draft_innovation',
          'commander', 'duel_deck', 'funny', 'starter', 'box',
          'from_the_vault', 'spellbook', 'planechase', 'archenemy',
          'memorabilia',
        ])
        const mainSets = all.filter(s =>
          MAIN_TYPES.has(s.set_type) && !s.digital && s.card_count >= 1
        )
        setSets(mainSets)

        // Secret Lairs: parent set code 'sld' or the SLD set itself
        const slSets = all.filter(s =>
          !s.digital && (s.code === 'sld' || s.parent_set_code === 'sld')
        ).sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''))
        setSecretLairs(slSets)
      })
      .catch(() => {})
      .finally(() => setSetsLoad(false))
  }, [])

  const openCardDetail = async (cardOrName) => {
    setPrintLoad(true)
    setPrintings([])
    let card = typeof cardOrName === 'string' ? null : cardOrName

    if (!card) {
      card = await getCardDetails(cardOrName)
      if (!card) { showToast('Card not found'); setPrintLoad(false); return }
    }

    setCardDetail(card)
    prevView.current = view
    setView('card')
    setRecentCards(saveRecentlyViewed(card))
    getAllPrintings(card.name)
      .then(p => { setPrintings(p); setPrintLoad(false) })
      .catch(() => setPrintLoad(false))
  }

  // Switch to a different printing of the same card without re-fetching the printings list
  const switchPrinting = (printing) => {
    setCardDetail(printing)
  }

  const openSet = (set) => {
    setSelSet(set)
    prevView.current = 'home'
    setView('set')
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (view === 'card' && cardDetail) {
    return (
      <CardDetailView
        card={cardDetail}
        printings={printings}
        printingsLoading={printLoad}
        onBack={() => setView(prevView.current)}
        openAddCard={openAddCard}
        showToast={showToast}
        onPrintingSelect={switchPrinting}
        user={user}
        onStoreSearch={openStoreSearch}
      />
    )
  }

  if (view === 'search') {
    return (
      <SearchView
        onBack={() => setView('home')}
        onCardSelect={(name) => openCardDetail(name)}
      />
    )
  }

  if (view === 'set' && selectedSet) {
    return (
      <SetView
        set={selectedSet}
        onBack={() => setView('home')}
        onCardSelect={(card) => openCardDetail(card)}
      />
    )
  }

  // ── Home ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {/* Page title */}
      <div style={{ padding: '20px 16px 12px' }}>
        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: WHITE, letterSpacing: '-.4px' }}>Card Lookup</div>
        <div style={{ fontSize: '.78rem', color: MUTED, marginTop: '3px' }}>Search cards · Browse sets · Explore products</div>
      </div>

      {/* Search all cards row */}
      <div
        onClick={() => setView('search')}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: '#0d0d0d', borderTop: `1px solid ${DIVID}`, borderBottom: `1px solid ${DIVID}`, cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = ROW}
        onMouseLeave={e => e.currentTarget.style.background = '#0d0d0d'}
      >
        <span style={{ fontSize: '1rem' }}>🔍</span>
        <span style={{ flex: 1, color: '#ccc', fontSize: '.92rem' }}>Search All Cards</span>
        <span style={{ color: '#444', fontSize: '1.1rem', lineHeight: 1 }}>›</span>
      </div>

      {/* Random card row */}
      <div
        onClick={async () => {
          try {
            const res = await fetch('https://api.scryfall.com/cards/random')
            if (res.ok) openCardDetail(await res.json())
          } catch { showToast('Could not load random card') }
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: '#0d0d0d', borderBottom: `1px solid ${DIVID}`, cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = ROW}
        onMouseLeave={e => e.currentTarget.style.background = '#0d0d0d'}
      >
        <span style={{ fontSize: '1rem' }}>🎲</span>
        <span style={{ flex: 1, color: '#ccc', fontSize: '.92rem' }}>Random Card</span>
        <span style={{ color: '#444', fontSize: '1.1rem', lineHeight: 1 }}>›</span>
      </div>

      {/* Recently Viewed */}
      {recentCards.length > 0 && (
        <div style={{ marginTop: '24px', paddingBottom: '4px' }}>
          <div style={{ padding: '0 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: MUTED }}>
              Recently Viewed
            </div>
            <button
              onClick={() => { localStorage.removeItem(RV_KEY); setRecentCards([]) }}
              style={{ background: 'none', border: 'none', color: '#333', fontSize: '.65rem', cursor: 'pointer', padding: '2px 4px' }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', paddingLeft: '16px', paddingRight: '16px', overflowX: 'auto', paddingBottom: '12px' }}>
            {recentCards.map(rc => (
              <div
                key={rc.id}
                onClick={() => openCardDetail(rc.name)}
                style={{ flexShrink: 0, width: '80px', cursor: 'pointer' }}
              >
                {rc.img
                  ? <img src={rc.img} alt={rc.name} style={{ width: '80px', borderRadius: '6px', display: 'block', border: '1px solid #1a1a1a', transition: 'transform .12s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                  : <div style={{ width: '80px', height: '112px', background: '#111', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🃏</div>
                }
                <div style={{ marginTop: '4px', fontSize: '.6rem', color: '#888', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rc.price ? `$${parseFloat(rc.price).toFixed(2)}` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sealed Products ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: recentCards.length > 0 ? 16 : 28 }}>
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: MUTED }}>
            Sealed Products
          </div>
          <span style={{ fontSize: '.6rem', color: '#2a2a2a' }}>scroll ›</span>
        </div>
        <div style={{
          display: 'flex', gap: 12,
          paddingLeft: 16, paddingBottom: 20,
          overflowX: 'auto', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}>
          {SEALED_PRODUCTS.map(p => <ProductCard key={p.id} product={p} />)}
          <div style={{ flexShrink: 0, width: 16 }} />
        </div>
      </div>

      {/* ── Sets Browser ───────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${DIVID}` }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ fontSize: '.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: MUTED, marginBottom: 10 }}>
            Browse Sets
          </div>
          <input
            value={setSearch}
            onChange={e => setSetSearch(e.target.value)}
            placeholder="Search sets…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#111', border: '1px solid #222',
              borderRadius: '8px', padding: '9px 14px',
              color: '#e0e0e0', fontSize: '.85rem', outline: 'none',
            }}
          />
        </div>

        {setsLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '.82rem' }}>Loading sets…</div>
        ) : (() => {
          const q = setSearch.toLowerCase()
          // Merge all sets into one pool; exclude the Secret Lair parent umbrella entry
          const allSetsFlat = [
            ...sets,
            ...secretLairs.filter(s => s.code !== 'sld'),
          ]
          const filtered = allSetsFlat.filter(s =>
            !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
          )

          if (filtered.length === 0) {
            return <div style={{ padding: '24px', textAlign: 'center', color: MUTED, fontSize: '.82rem' }}>No sets found</div>
          }

          // Group by release year, newest first; within year sort newest → oldest
          const byYear = {}
          filtered.forEach(s => {
            const year = s.released_at?.slice(0, 4) || 'Unknown'
            if (!byYear[year]) byYear[year] = []
            byYear[year].push(s)
          })
          const years = Object.keys(byYear).sort((a, b) => parseInt(b) - parseInt(a))
          years.forEach(yr => byYear[yr].sort((a, b) => (b.released_at || '').localeCompare(a.released_at || '')))

          const SetRow = ({ set }) => {
            const isSecretLair = set.parent_set_code === 'sld' || set.code === 'sld'
            const typeLabel = isSecretLair ? 'Secret Lair'
              : set.set_type === 'commander'       ? 'Commander'
              : set.set_type === 'masters'         ? 'Masters'
              : set.set_type === 'draft_innovation'? 'Draft Innovation'
              : set.set_type === 'funny'           ? 'Un-Set'
              : set.set_type === 'duel_deck'       ? 'Duel Deck'
              : set.set_type === 'from_the_vault'  ? 'From the Vault'
              : set.set_type === 'spellbook'       ? 'Spellbook'
              : null
            return (
              <div
                onClick={() => openSet(set)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', borderBottom: `1px solid #0f0f0f`, cursor: 'pointer', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = ROW}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <SetIcon uri={set.icon_svg_uri} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e0e0e0', fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {set.name}
                  </div>
                  <div style={{ fontSize: '.68rem', color: MUTED, marginTop: '1px' }}>
                    {set.card_count} cards{typeLabel ? ` · ${typeLabel}` : ''}
                  </div>
                </div>
                <span style={{ color: '#333', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>›</span>
              </div>
            )
          }

          return (
            <div>
              {years.map(year => (
                <div key={year}>
                  <div style={{
                    padding: '10px 16px 4px',
                    fontSize: '.65rem', fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '1.2px', color: '#444',
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: `1px solid #0a0a0a`,
                  }}>
                    <span>{year}</span>
                    <span style={{ color: '#2a2a2a' }}>{byYear[year].length}</span>
                  </div>
                  {byYear[year].map(set => <SetRow key={set.code} set={set} />)}
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
