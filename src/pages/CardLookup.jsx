import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { searchScryfall, getCardDetails, getAllPrintings } from '../lib/utils'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { getManaPoolLink } from '../lib/manapool'
import { supabase, hasSupabase } from '../lib/supabase'
import { addWishlistItem } from '../lib/db'

//  Rarity helpers 
const RARITY_ORDER  = { mythic: 0, rare: 1, uncommon: 2, common: 3, special: 4, bonus: 5 }
const RARITY_COLOR  = { mythic: '#f97316', rare: '#16a389', uncommon: '#94a3b8', common: '#6b7280' }
const RARITY_LABEL  = { mythic: 'Mythic Rare', rare: 'Rare', uncommon: 'Uncommon', common: 'Common', special: 'Special', bonus: 'Bonus' }

//  Tiny helpers
const BG    = 'var(--bg-primary)'
const ROW   = 'var(--bg-hover)'
const DIVID = 'var(--border)'
const MUTED = 'var(--text-muted)'
const WHITE = 'var(--text-primary)'

function SortChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', borderRadius: '99px', fontSize: '.74rem', fontWeight: 600,
      cursor: 'pointer', border: '1px solid',
      background: active ? 'var(--accent-gold)' : 'transparent',
      color:      active ? '#fff' : 'var(--text-secondary)',
      borderColor: active ? 'var(--accent-gold)' : 'var(--border)',
    }}>
      {label}
    </button>
  )
}

function SetIcon({ uri, size = 22 }) {
  if (!uri) return <div style={{ width: size, height: size, background: 'var(--bg-card)', borderRadius: '4px', flexShrink: 0 }} />
  return <img src={uri} alt="" style={{ width: size, height: size, filter: 'opacity(0.6)', flexShrink: 0 }} />
}

//  Wishlist helper 
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
    showToast(` ${card.name} added to wishlist!`)
  } catch (err) {
    if (err.message?.toLowerCase().includes('duplicate') || err.message?.toLowerCase().includes('unique')) {
      showToast(`${card.name} is already on your wishlist`)
    } else {
      showToast('Could not save to wishlist')
    }
  }
}

//  Printing thumbnail card (horizontal scroll) 
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
        background: 'var(--bg-card)',
        transition: 'border-color .15s, opacity .15s',
        opacity: isSelected ? 1 : 0.75,
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.opacity = '1' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.opacity = '0.75' }}
    >
      {/* Card image */}
      {img
        ? <img src={img} alt="" style={{ width: '100%', display: 'block', borderRadius: '6px 6px 0 0' }} />
        : <div style={{ width: '100%', aspectRatio: '0.716', background: 'var(--bg-card)', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}></div>
      }

      {/* Info below image */}
      <div style={{ padding: '7px 8px 8px' }}>
        {/* Set row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '4px' }}>
          <img
            src={`https://svgs.scryfall.io/sets/${printing.set}.svg`}
            alt=""
            style={{ width: '11px', height: '11px', filter: 'opacity(0.5)', flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none' }}
          />
          <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                <span style={{ fontSize: '.6rem' }}></span>
                <span style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--accent-blue)' }}>${foil}</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>—</div>
        )}
      </div>
    </div>
  )
}

//  Card Detail View 
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
          <img src={setIconUrl} alt="" style={{ width: '22px', height: '22px', filter: 'opacity(0.5)', flexShrink: 0 }}
            onError={e => { e.target.style.display = 'none' }} />
        )}
      </div>

      {/* Card image + legality (side-by-side on wide screens, stacked on mobile) */}
      <div style={{ padding: '20px 20px 8px', display: 'flex', gap: 28, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {img && (
          <img src={img} alt={card.name} style={{ width: 'min(260px, 62vw)', borderRadius: '14px', boxShadow: '0 12px 60px rgba(0,0,0,.9)', flexShrink: 0, display: 'block' }} />
        )}

        {/* Legality table */}
        {card.legalities && (
          <div style={{ flexShrink: 0, minWidth: 168 }}>
            <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>Format Legality</div>
            {[
              ['Standard',  'standard'],
              ['Pioneer',   'pioneer'],
              ['Modern',    'modern'],
              ['Legacy',    'legacy'],
              ['Vintage',   'vintage'],
              ['Commander', 'commander'],
              ['Pauper',    'pauper'],
              ['Premodern', 'premodern'],
            ].map(([label, key]) => {
              const status = card.legalities[key] || 'not_legal'
              const isLegal      = status === 'legal'
              const isBanned     = status === 'banned'
              const isRestricted = status === 'restricted'
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: '1px solid #111' }}>
                  <span style={{ fontSize: '.76rem', color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{
                    fontSize: '.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                    background: isLegal ? 'rgba(74,222,128,.1)' : isBanned ? 'rgba(239,68,68,.1)' : isRestricted ? 'rgba(61,214,186,.1)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${isLegal ? 'rgba(74,222,128,.25)' : isBanned ? 'rgba(239,68,68,.25)' : isRestricted ? 'rgba(61,214,186,.25)' : '#1e1e1e'}`,
                    color: isLegal ? '#4ade80' : isBanned ? '#f87171' : isRestricted ? '#3dd6ba' : '#333',
                  }}>
                    {isLegal ? 'Legal' : isBanned ? 'Banned' : isRestricted ? 'Restricted' : 'Not Legal'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Core info */}
      <div style={{ padding: '8px 16px 8px' }}>
        <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: '5px' }}>{card.type_line}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.72rem', color: rc }}>{RARITY_LABEL[card.rarity] || card.rarity}</span>
          {card.set && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '.72rem', color: MUTED }}>
              ·
              {setIconUrl && (
                <img src={setIconUrl} alt="" style={{ width: '13px', height: '13px', filter: 'opacity(0.5)', verticalAlign: 'middle' }}
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
          <div key={label} style={{ flex: 1, background: 'var(--bg-card)', padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: '.58rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
            <div style={{ fontSize: '.95rem', fontWeight: 700, color: val ? 'var(--accent-gold)' : '#2a2a2a', marginTop: '4px' }}>
              {val ? `$${val}` : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Oracle text */}
      {card.oracle_text && (
        <div style={{ margin: '0 16px 16px', background: 'var(--bg-secondary)', border: `1px solid ${DIVID}`, borderRadius: '10px', padding: '12px 14px', fontSize: '.82rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {card.oracle_text}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Buy from Mana Mint — only shown when in stock */}
        {storeListing && (
          <button
            onClick={() => onStoreSearch?.(card.name)}
            style={{
              width: '100%', padding: '13px',
              background: 'linear-gradient(135deg, #16a389, #1ec4a6)',
              color: '#000', border: 'none', borderRadius: '12px',
              fontWeight: 800, fontSize: '.9rem', cursor: 'pointer', letterSpacing: '.3px',
            }}
          >
             Buy from Mana Mint — ${storeListing.price?.toFixed(2)}
            {storeListing.is_foil ? ' ' : ''}
            {storeListing.condition && storeListing.condition !== 'NM' ? ` (${storeListing.condition})` : ''}
          </button>
        )}

        <button onClick={() => openAddCard(card)} style={{
          width: '100%', padding: '13px', background: 'var(--accent-gold)', color: '#fff',
          border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer',
          letterSpacing: '.3px',
        }}>
          + Add to Collection
        </button>
        <button onClick={() => addCardToWishlist(card, showToast, user)} style={{
          width: '100%', padding: '13px', background: 'transparent', color: 'var(--text-secondary)',
          border: `1px solid var(--border)`, borderRadius: '12px', fontWeight: 700, fontSize: '.9rem', cursor: 'pointer',
        }}>
           Add to Wishlist
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
           Buy on TCGPlayer
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
           Buy on ManaPool
        </a>
      </div>

      {/*  Other Printings / Alternate Arts  */}
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
            <div style={{ fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-muted)', flexShrink: 0 }}>
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
              style={{ fontSize: '.7rem', color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              View on Scryfall ↗
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

//  Set Card List View 
function SetView({ set, onBack, onCardSelect }) {
  const [cards, setCards]   = useState([])
  const [loading, setLoad]  = useState(true)
  const [sortBy, setSortBy] = useState('price')
  const [hasMore, setHasMore] = useState(false)
  const [nextPage, setNextPage] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const cacheKey = `vs-setcards-v2-${set.code}`
    // Serve the first page instantly from session cache if we've loaded it before
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null')
      if (cached?.cards?.length) {
        setCards(cached.cards)
        setHasMore(cached.hasMore || false)
        setNextPage(cached.nextPage || null)
        setLoad(false)
        return
      }
    } catch {}

    setLoad(true)
    setCards([])
    // unique=prints (not cards) so every distinct printing shows — including
    // Japanese/foreign alternate-art versions (e.g. Mystical Archive JP) and
    // showcase/borderless/etched treatments, which unique=cards collapses away.
    fetch(`https://api.scryfall.com/cards/search?q=set:${set.code}&order=usd&unique=prints&dir=desc`)
      .then(r => r.json())
      .then(data => {
        if (data.data) {
          setCards(data.data)
          setHasMore(data.has_more || false)
          setNextPage(data.next_page || null)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              cards: data.data, hasMore: data.has_more || false, nextPage: data.next_page || null,
            }))
          } catch {}
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
          {sorted.map(card => {
            const thumb = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small
            // Distinguish printings of the same card: language, special treatment
            const isForeign = card.lang && card.lang !== 'en'
            const treatment = card.frame_effects?.includes('showcase') ? 'Showcase'
              : card.frame_effects?.includes('extendedart') ? 'Extended'
              : card.frame_effects?.includes('etched') ? 'Etched'
              : card.border_color === 'borderless' ? 'Borderless'
              : card.full_art ? 'Full Art'
              : null
            return (
            <div
              key={card.id}
              onClick={() => onCardSelect(card)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: `1px solid var(--border)`, cursor: 'pointer', transition: 'background .1s' }}
              onMouseEnter={e => e.currentTarget.style.background = ROW}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {thumb
                ? <img src={thumb} alt="" style={{ width: 30, borderRadius: 3, flexShrink: 0 }} loading="lazy" />
                : <div style={{ width: 30, height: 42, background: 'var(--bg-card)', borderRadius: 3, flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {card.name}
                </div>
                <div style={{ fontSize: '.7rem', color: MUTED, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ color: RARITY_COLOR[card.rarity] || MUTED }}>{RARITY_LABEL[card.rarity] || card.rarity}</span>
                  <span>#{card.collector_number}</span>
                  {isForeign && <span style={{ color: '#f97316', fontWeight: 700, textTransform: 'uppercase' }}>{card.lang}</span>}
                  {treatment && <span style={{ color: 'var(--accent-blue)' }}>{treatment}</span>}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: card.prices?.usd ? WHITE : '#2a2a2a', fontSize: '.88rem', marginLeft: '14px', flexShrink: 0 }}>
                {card.prices?.usd ? `$${card.prices.usd}` : '—'}
              </div>
            </div>
            )
          })}

          {/* Load more */}
          {hasMore && (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <button onClick={loadMore} disabled={loadingMore} style={{
                background: 'transparent', border: `1px solid var(--border)`, color: 'var(--text-secondary)',
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

//  Search View 
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
              width: '100%', background: 'var(--bg-card)', border: `1px solid var(--border)`,
              borderRadius: '8px', padding: '9px 14px', color: WHITE,
              fontSize: '.9rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
          {/* Dropdown */}
          {showDrop && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--bg-card)', border: `1px solid var(--border)`, borderRadius: '10px',
              zIndex: 200, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,.8)',
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s}
                  onClick={() => pick(s)}
                  style={{ padding: '11px 16px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '.88rem', borderBottom: i < suggestions.length - 1 ? `1px solid var(--border)` : 'none', transition: 'background .1s' }}
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
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}></div>
          <div style={{ color: MUTED, fontSize: '.85rem' }}>Type a card name to search across all MTG sets</div>
        </div>
      )}
    </div>
  )
}

//  Main Component 
//  Recently viewed helpers 
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

//  sessionStorage helpers for persisting open-card state across remounts 
const SS_VIEW   = 'vs-cl-view'
const SS_CARD   = 'vs-cl-card'
function ssGetView()   { try { return sessionStorage.getItem(SS_VIEW) || 'home' } catch { return 'home' } }
function ssGetCard()   { try { const s = sessionStorage.getItem(SS_CARD); return s ? JSON.parse(s) : null } catch { return null } }
function ssSaveView(v) { try { sessionStorage.setItem(SS_VIEW, v) } catch {} }
function ssSaveCard(c) { try { if (c) sessionStorage.setItem(SS_CARD, JSON.stringify(c)); else sessionStorage.removeItem(SS_CARD) } catch {} }

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
  const [hoverInfo,   setHoverInfo]   = useState(null) // { img, name, price, set, x, y }
  const prevView = useRef(ssGetView() === 'card' ? 'home' : ssGetView())

  // Upgrade a stored /small/ Scryfall URL to /normal/ for the hover preview
  function toNormalImg(url) {
    return url ? url.replace('/small/', '/normal/') : null
  }

  // Wrappers that persist to sessionStorage so open-card state survives any remount
  const setView = useCallback((v) => { setViewRaw(v); ssSaveView(v) }, [])
  const setCardDetail = useCallback((c) => { setCardDetailRaw(c); ssSaveCard(c) }, [])

  // Keep a ref to openCardDetail so the event listener always calls the latest version
  const openCardDetailRef = useRef(null)
  useEffect(() => { openCardDetailRef.current = openCardDetail })

  // Persistent listener for "View in Card Lookup" from Market Movers modal.
  // CardLookup stays mounted (display:none when hidden), so a mount-only effect
  // won't re-fire — a custom event bridges the gap.
  useEffect(() => {
    const handler = (e) => openCardDetailRef.current?.(e.detail.name)
    window.addEventListener('vaulted:lookup-card', handler)
    return () => window.removeEventListener('vaulted:lookup-card', handler)
  }, []) // eslint-disable-line

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

  // Load MTG paper sets — all of them.
  // The set list barely changes, so cache the processed result in localStorage
  // (24h TTL) and render instantly on revisit instead of re-fetching ~900 sets.
  useEffect(() => {
    const SETS_CACHE_KEY = 'vs-sets-cache-v1'
    const SETS_TTL = 24 * 60 * 60 * 1000 // 24h

    function process(all) {
      // Main paper sets: broad type list covers every physical product line
      const MAIN_TYPES = new Set([
        'expansion', 'core', 'masters', 'draft_innovation',
        'commander', 'duel_deck', 'funny', 'starter', 'box',
        'from_the_vault', 'spellbook', 'planechase', 'archenemy',
        'masterpiece',
      ])
      const mainSets = all.filter(s =>
        MAIN_TYPES.has(s.set_type) && !s.digital && s.card_count >= 1
      )
      // Secret Lairs: parent set code 'sld' or the SLD set itself
      const slSets = all.filter(s =>
        !s.digital && (s.code === 'sld' || s.parent_set_code === 'sld')
      ).sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''))
      return { mainSets, slSets }
    }

    // Try cache first for an instant render
    let servedFromCache = false
    try {
      const cached = JSON.parse(localStorage.getItem(SETS_CACHE_KEY) || 'null')
      if (cached && Date.now() - cached.ts < SETS_TTL && cached.mainSets?.length) {
        setSets(cached.mainSets)
        setSecretLairs(cached.slSets || [])
        setSetsLoad(false)
        servedFromCache = true
      }
    } catch {}

    if (!servedFromCache) setSetsLoad(true)

    // Refresh from network (updates cache; only flips loading if we had no cache)
    fetch('https://api.scryfall.com/sets')
      .then(r => r.json())
      .then(data => {
        const { mainSets, slSets } = process(data.data || [])
        setSets(mainSets)
        setSecretLairs(slSets)
        try {
          localStorage.setItem(SETS_CACHE_KEY, JSON.stringify({ ts: Date.now(), mainSets, slSets }))
        } catch {}
      })
      .catch(() => {})
      .finally(() => { if (!servedFromCache) setSetsLoad(false) })
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
    // Never set prevView to 'card' — that would make Back loop to itself
    prevView.current = view === 'card' ? 'home' : view
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

  //  Render 
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

  //  Home 
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
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: 'var(--bg-secondary)', borderTop: `1px solid ${DIVID}`, borderBottom: `1px solid ${DIVID}`, cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = ROW}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
      >
        <span style={{ fontSize: '1rem' }}></span>
        <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: '.92rem' }}>Search All Cards</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1 }}>›</span>
      </div>

      {/* Random card row */}
      <div
        onClick={async () => {
          try {
            const res = await fetch('https://api.scryfall.com/cards/random')
            if (res.ok) openCardDetail(await res.json())
          } catch { showToast('Could not load random card') }
        }}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', background: 'var(--bg-secondary)', borderBottom: `1px solid ${DIVID}`, cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = ROW}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
      >
        <span style={{ fontSize: '1rem' }}></span>
        <span style={{ flex: 1, color: 'var(--text-secondary)', fontSize: '.92rem' }}>Random Card</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1 }}>›</span>
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
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '.65rem', cursor: 'pointer', padding: '2px 4px' }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', gap: '10px', paddingLeft: '16px', paddingRight: '16px', overflowX: 'auto', paddingBottom: '12px' }}>
            {recentCards.map(rc => (
              <div
                key={rc.id}
                onClick={() => { setHoverInfo(null); openCardDetail(rc.name) }}
                onMouseEnter={e => {
                  if (!window.matchMedia('(hover: hover)').matches) return
                  const rect = e.currentTarget.getBoundingClientRect()
                  setHoverInfo({ img: toNormalImg(rc.img), name: rc.name, price: rc.price, set: rc.set, x: rect.left + rect.width / 2, y: rect.top })
                }}
                onMouseLeave={() => setHoverInfo(null)}
                style={{ flexShrink: 0, width: '80px', cursor: 'pointer' }}
              >
                {rc.img
                  ? <img src={rc.img} alt={rc.name} style={{ width: '80px', borderRadius: '6px', display: 'block', border: '1px solid #1a1a1a', transition: 'transform .12s' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    />
                  : <div style={{ width: '80px', height: '112px', background: 'var(--bg-card)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}></div>
                }
                <div style={{ marginTop: '4px', fontSize: '.6rem', color: 'var(--text-secondary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rc.price ? `$${parseFloat(rc.price).toFixed(2)}` : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Hover preview portal */}
          {hoverInfo && (() => {
            const PREVIEW_W = 200
            const PREVIEW_H = 310
            const left = Math.max(8, Math.min(hoverInfo.x - PREVIEW_W / 2, window.innerWidth - PREVIEW_W - 8))
            const top  = hoverInfo.y > PREVIEW_H + 20
              ? hoverInfo.y - PREVIEW_H - 10   // show above the strip
              : hoverInfo.y + 130 + 10          // show below (below the thumbnail)
            return (
              <div style={{
                position: 'fixed', left, top,
                width: PREVIEW_W,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'hidden',
                zIndex: 1000,
                boxShadow: '0 16px 64px rgba(0,0,0,.95)',
                pointerEvents: 'none',
                animation: 'fadeInUp .12s ease',
              }}>
                {hoverInfo.img
                  ? <img src={hoverInfo.img} alt={hoverInfo.name} style={{ width: '100%', display: 'block' }} />
                  : <div style={{ width: '100%', aspectRatio: '0.716', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}></div>
                }
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '.82rem', marginBottom: '2px', lineHeight: 1.3 }}>{hoverInfo.name}</div>
                  {hoverInfo.set && <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginBottom: '5px' }}>{hoverInfo.set}</div>}
                  <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
                    {hoverInfo.price ? `$${parseFloat(hoverInfo.price).toFixed(2)}` : '—'}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/*  Sets Browser  */}
      <div style={{ marginTop: recentCards.length > 0 ? 8 : 24, borderTop: `1px solid ${DIVID}` }}>
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
              background: 'var(--bg-card)', border: '1px solid #222',
              borderRadius: '8px', padding: '9px 14px',
              color: 'var(--text-primary)', fontSize: '.85rem', outline: 'none',
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
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 16px', borderBottom: `1px solid var(--border)`, cursor: 'pointer', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = ROW}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <SetIcon uri={set.icon_svg_uri} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {set.name}
                  </div>
                  <div style={{ fontSize: '.68rem', color: MUTED, marginTop: '1px' }}>
                    {set.card_count} cards{typeLabel ? ` · ${typeLabel}` : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>›</span>
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
                    textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--text-secondary)',
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: `1px solid var(--border)`,
                  }}>
                    <span>{year}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{byYear[year].length}</span>
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
