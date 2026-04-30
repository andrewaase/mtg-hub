import { useState, useEffect, useMemo, useRef } from 'react'
import { searchScryfall, getCardDetails, getAllPrintings } from '../lib/utils'
import { getTCGPlayerLink } from '../lib/tcgplayer'
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
          <img src={img} alt={card.name} style={{ width: '210px', borderRadius: '14px', boxShadow: '0 12px 60px rgba(0,0,0,.9)' }} />
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
export default function CardLookup({ showToast, openAddCard, initialSearch = '', onSearchUsed, user, openStoreSearch }) {
  const [view, setView]           = useState('home') // 'home' | 'search' | 'set' | 'card'
  const [sets, setSets]           = useState([])
  const [setsLoading, setSetsLoad] = useState(true)
  const [selectedSet, setSelSet]  = useState(null)
  const [cardDetail, setCardDetail] = useState(null)
  const [printings, setPrintings]  = useState([])
  const [printLoad, setPrintLoad]  = useState(false)
  const prevView = useRef('home')

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

  // Load MTG paper sets
  useEffect(() => {
    setSetsLoad(true)
    fetch('https://api.scryfall.com/sets')
      .then(r => r.json())
      .then(data => {
        const valid = ['expansion', 'core', 'masters', 'draft_innovation', 'commander', 'duel_deck']
        const paper = (data.data || [])
          .filter(s => valid.includes(s.set_type) && !s.digital && s.card_count >= 10)
          .slice(0, 40)
        setSets(paper)
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

  // ── Home / Expansions ────────────────────────────────────────────────────
  return (
    <div style={{ background: BG, minHeight: '100vh' }}>
      {/* Page title */}
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: WHITE, letterSpacing: '-.4px' }}>Expansions</div>
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

      {/* Sets list */}
      <div style={{ marginTop: '24px' }}>
        <div style={{ padding: '0 16px 8px', fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: MUTED }}>
          Recent expansions
        </div>

        {setsLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: MUTED, fontSize: '.82rem' }}>Loading sets…</div>
        ) : (
          <div style={{ borderTop: `1px solid ${DIVID}` }}>
            {sets.map(set => (
              <div
                key={set.code}
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
                    {set.card_count} cards · {set.released_at?.slice(0, 4)}
                  </div>
                </div>
                <span style={{ color: '#333', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
