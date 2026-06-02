import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')
const CART_KEY      = 'vs-cart-v1'
const DEFAULT_SHIPPING = 4.99

//  Helpers 
function fmt(n) {
  return `$${parseFloat(n || 0).toFixed(2)}`
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') } catch { return [] }
}
function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {}
}

const CONDITION_LABELS = { NM: 'Near Mint', LP: 'Light Play', MP: 'Moderate Play', HP: 'Heavy Play', DMG: 'Damaged' }

const COLOR_OPTIONS = [
  { id: 'W', label: ' White' },
  { id: 'U', label: ' Blue' },
  { id: 'B', label: ' Black' },
  { id: 'R', label: ' Red' },
  { id: 'G', label: ' Green' },
  { id: 'C', label: ' Colorless' },
]
const RARITY_OPTIONS = ['common', 'uncommon', 'rare', 'mythic']
const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Battle']

function ChipRow({ options, value, onChange, multi = false, labelFn }) {
  function toggle(id) {
    if (multi) {
      const next = value.includes(id) ? value.filter(v => v !== id) : [...value, id]
      onChange(next)
    } else {
      onChange(value === id ? null : id)
    }
  }
  const isActive = (id) => multi ? value.includes(id) : value === id
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map(opt => {
        const id = typeof opt === 'string' ? opt : opt.id
        const label = labelFn ? labelFn(opt) : (typeof opt === 'string' ? opt : opt.label)
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            style={{
              padding: '5px 12px', borderRadius: '99px',
              border: `1.5px solid ${isActive(id) ? 'var(--accent-gold)' : 'var(--border)'}`,
              background: isActive(id) ? 'rgba(30,196,166,.15)' : 'var(--bg-secondary)',
              color: isActive(id) ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontSize: '.72rem', fontWeight: isActive(id) ? 700 : 400,
              cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

//  Price history chart (pure SVG, no external deps) 
function PriceChart({ scryfallId, isFoil, currentPrice }) {
  const [history, setHistory] = useState(null) // null = loading

  useEffect(() => {
    if (!scryfallId) { setHistory([]); return }
    supabase
      .from('price_history')
      .select('price, recorded_at')
      .eq('scryfall_id', scryfallId)
      .eq('is_foil', isFoil || false)
      .order('recorded_at', { ascending: true })
      .limit(90)
      .then(({ data }) => setHistory(data || []))
  }, [scryfallId, isFoil])

  if (history === null) {
    return <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Loading price history…</div>
  }

  if (history.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '14px 0', color: 'var(--text-muted)', fontSize: '.72rem' }}>
        <div style={{ fontSize: '1.4rem', marginBottom: 5 }}></div>
        Price tracking begins today — check back after the next daily sync!
      </div>
    )
  }

  //  Layout constants 
  const W = 500, H = 140
  const PAD = { top: 14, right: 12, bottom: 28, left: 44 }
  const cW  = W - PAD.left - PAD.right
  const cH  = H - PAD.top  - PAD.bottom

  //  Scale helpers 
  const prices = history.map(d => parseFloat(d.price))
  const times  = history.map(d => new Date(d.recorded_at + 'T12:00:00Z').getTime())

  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const minT = Math.min(...times),  maxT = Math.max(...times)

  const pSpan = (maxP - minP) || minP * 0.2 || 1
  const pMin  = minP - pSpan * 0.1
  const pMax  = maxP + pSpan * 0.1
  const pFull = pMax - pMin
  const tSpan = maxT - minT || 1

  const sx = t => PAD.left + ((t - minT) / tSpan) * cW
  const sy = p => PAD.top  + (1 - (p - pMin) / pFull) * cH

  const pts = history.map(d => ({
    x:     sx(new Date(d.recorded_at + 'T12:00:00Z').getTime()),
    y:     sy(parseFloat(d.price)),
    price: parseFloat(d.price),
    date:  d.recorded_at,
  }))

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${pts[pts.length-1].x.toFixed(1)},${(PAD.top+cH+1).toFixed(1)} L${pts[0].x.toFixed(1)},${(PAD.top+cH+1).toFixed(1)} Z`

  //  Grid lines (4 horizontal) 
  const gridLines = [0, 0.33, 0.67, 1].map(f => ({
    y:     PAD.top + (1 - f) * cH,
    label: `$${(pMin + f * pFull).toFixed(2)}`,
  }))

  //  X-axis: up to 5 evenly-spaced date labels 
  const xIdxs = history.length <= 5
    ? history.map((_, i) => i)
    : [0, ...Array.from({ length: 3 }, (_, k) => Math.round((k + 1) * (history.length - 1) / 4)), history.length - 1]
  const xLabels = [...new Set(xIdxs)].map(i => ({
    x:     pts[i].x,
    label: new Date(history[i].recorded_at + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  //  Stats 
  const week7ago = Date.now() - 7 * 24 * 60 * 60 * 1000
  const weekBase = history.filter(d => new Date(d.recorded_at + 'T12:00:00Z').getTime() <= week7ago)
  const weekChange = weekBase.length > 0
    ? currentPrice - parseFloat(weekBase[weekBase.length - 1].price)
    : null

  const stats = [
    { label: 'Current', value: `$${currentPrice.toFixed(2)}`, color: 'var(--text-primary)' },
    {
      label: '7d Change',
      value: weekChange != null ? `${weekChange >= 0 ? '+' : ''}$${Math.abs(weekChange).toFixed(2)}` : '—',
      color: weekChange == null ? 'var(--text-muted)' : weekChange >= 0 ? '#4ade80' : '#f87171',
    },
    { label: 'High', value: `$${maxP.toFixed(2)}`, color: '#4ade80' },
    { label: 'Low',  value: `$${minP.toFixed(2)}`, color: '#f87171' },
  ]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines + Y labels */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={g.y} x2={PAD.left + cW} y2={g.y}
              stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={PAD.left - 5} y={g.y + 3.5} textAnchor="end"
              fontSize="9" fill="rgba(255,255,255,0.38)">{g.label}</text>
          </g>
        ))}

        {/* X-axis date labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 5} textAnchor="middle"
            fontSize="9" fill="rgba(255,255,255,0.38)">{l.label}</text>
        ))}

        {/* Gradient area fill */}
        <path d={areaPath} fill="url(#phGrad)" />

        {/* Price line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="1.8"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Latest price dot */}
        <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y}
          r="3.5" fill="#3b82f6" stroke="var(--bg-card)" strokeWidth="1.5" />
      </svg>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginTop: 8 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            textAlign: 'center', background: 'rgba(255,255,255,0.04)',
            borderRadius: 6, padding: '5px 4px', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</div>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

//  Card detail modal 
function CardDetailModal({ listing, onClose, onAdd, inCart }) {
  const [cardData, setCardData] = useState(null)
  const [loadingCard, setLoadingCard] = useState(true)

  useEffect(() => {
    const url = listing.scryfall_id
      ? `https://api.scryfall.com/cards/${listing.scryfall_id}`
      : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(listing.name)}`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setCardData(data); setLoadingCard(false) })
      .catch(() => setLoadingCard(false))
  }, [listing.scryfall_id, listing.name])

  // Double-faced cards store text in card_faces[0]
  const face      = cardData?.card_faces?.[0] || cardData
  const oracle    = face?.oracle_text    || ''
  const typeLine  = face?.type_line      || cardData?.type_line || ''
  const manaCost  = face?.mana_cost      || cardData?.mana_cost || ''
  const flavor    = face?.flavor_text    || ''
  const power     = cardData?.power, toughness = cardData?.toughness
  const loyalty   = cardData?.loyalty

  const stockColor = listing.qty_available <= 2 ? '#f87171' : listing.qty_available <= 5 ? '#fb923c' : '#4ade80'

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(560px, 96vw)', maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 401, padding: '20px',
        boxShadow: '0 24px 60px rgba(0,0,0,.65)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '50%',
          width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: '.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {/* Card image */}
          <div style={{ flexShrink: 0 }}>
            {listing.img_url
              ? <img src={listing.img_url} alt={listing.name} style={{ width: 'min(230px, 42vw)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,.6)', display: 'block' }} />
              : <div style={{ width: 'min(230px, 42vw)', aspectRatio: '63/88', background: 'var(--bg-card)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}></div>
            }
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.25, paddingRight: 32 }}>{listing.name}</div>
              {!loadingCard && typeLine && (
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{typeLine}</div>
              )}
              {!loadingCard && manaCost && (
                <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>{manaCost}</div>
              )}
            </div>

            {loadingCard && (
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading card text…</div>
            )}

            {!loadingCard && oracle && (
              <div style={{
                fontSize: '.76rem', lineHeight: 1.65, color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap', padding: '9px 11px',
                background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)',
              }}>{oracle}</div>
            )}

            {!loadingCard && (power != null || loyalty != null) && (
              <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {power != null ? `${power}/${toughness}` : `Loyalty: ${loyalty}`}
              </div>
            )}

            {!loadingCard && flavor && (
              <div style={{ fontSize: '.68rem', fontStyle: 'italic', color: 'var(--text-muted)', borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
                {flavor}
              </div>
            )}

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {listing.condition && (
                <span style={{ fontSize: '.62rem', fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', borderRadius: 4, padding: '2px 7px' }}>
                  {CONDITION_LABELS[listing.condition] || listing.condition}
                </span>
              )}
              {listing.is_foil && (
                <span style={{ fontSize: '.62rem', fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#c084fc)', color: '#fff', borderRadius: 4, padding: '2px 7px' }}> FOIL</span>
              )}
              {listing.set_name && (
                <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{listing.set_name}</span>
              )}
            </div>

            <div style={{ fontSize: '.7rem', fontWeight: 600, color: stockColor }}>
              {listing.qty_available === 1 ? '1 in stock' : `${listing.qty_available} in stock`}
            </div>

            {/* Price + CTA */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 4 }}>
              <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--accent-gold)' }}>{fmt(listing.price)}</div>
              <button
                onClick={() => { if (!inCart) onAdd(listing); onClose() }}
                style={{
                  padding: '9px 22px', borderRadius: 10, border: 'none',
                  cursor: inCart ? 'default' : 'pointer',
                  background: inCart ? 'rgba(30,196,166,.15)' : 'var(--accent-gold)',
                  color: inCart ? 'var(--accent-gold)' : '#fff',
                  fontWeight: 800, fontSize: '.88rem', transition: 'all .15s',
                }}
              >{inCart ? '✓ In Cart' : '+ Add to Cart'}</button>
            </div>
          </div>
        </div>

        {/*  Price History chart  */}
        {listing.scryfall_id && (
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{
              fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.6px', color: 'var(--text-muted)', marginBottom: 10,
            }}> Price History</div>
            <PriceChart
              scryfallId={listing.scryfall_id}
              isFoil={listing.is_foil}
              currentPrice={parseFloat(listing.price) || 0}
            />
          </div>
        )}
      </div>
    </>
  )
}

//  Listing card 
function ListingCard({ listing, onAdd, inCart, onView }) {
  const stockColor = listing.qty_available <= 2 ? '#f87171' : listing.qty_available <= 5 ? '#fb923c' : '#4ade80'

  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${inCart ? 'var(--accent-gold)' : 'var(--border)'}`,
      borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: inCart ? '0 0 0 1px var(--accent-gold)' : 'none',
      position: 'relative',
    }}>
      {/* Clickable image area */}
      <div onClick={() => onView(listing)} style={{ cursor: 'pointer', position: 'relative' }}>
        {listing.img_url
          ? <img src={listing.img_url} alt={listing.name} style={{ width: '100%', display: 'block', aspectRatio: '63/88', objectFit: 'cover' }} />
          : <div style={{ width: '100%', aspectRatio: '63/88', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}></div>
        }
        {listing.is_foil && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'linear-gradient(135deg,#a78bfa,#c084fc)',
            color: '#fff', borderRadius: '4px', padding: '2px 6px',
            fontSize: '.6rem', fontWeight: 800, letterSpacing: '.3px',
          }}> FOIL</div>
        )}
        {/* "tap to read" hint overlay */}
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 6, opacity: 0, transition: 'opacity .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0}
        >
          <span style={{ fontSize: '.58rem', background: 'rgba(0,0,0,.7)', color: '#fff', borderRadius: 4, padding: '2px 6px' }}>tap to read</span>
        </div>
      </div>

      <div style={{ padding: '8px 10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div
          onClick={() => onView(listing)}
          style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--text-primary)', lineHeight: 1.25, cursor: 'pointer' }}
        >
          {listing.name}
        </div>
        {listing.set_name && (
          <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{listing.set_name}</div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {listing.condition && (
            <span style={{ fontSize: '.6rem', fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', borderRadius: '4px', padding: '1px 5px' }}>
              {listing.condition}
            </span>
          )}
          <span style={{ fontSize: '.6rem', fontWeight: 600, color: stockColor }}>
            {listing.qty_available === 1 ? '1 in stock' : `${listing.qty_available} in stock`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--accent-gold)' }}>
            {fmt(listing.price)}
          </div>
          <button
            onClick={() => onAdd(listing)}
            style={{
              padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontSize: '.72rem', fontWeight: 700,
              background: inCart ? 'rgba(30,196,166,.2)' : 'var(--accent-gold)',
              color: inCart ? 'var(--accent-gold)' : '#fff',
              transition: 'all .15s',
            }}
          >
            {inCart ? '✓ In Cart' : '+ Cart'}
          </button>
        </div>
      </div>
    </div>
  )
}

//  Pack art placeholders (shown when no img_url is set) 

function VaultedRaritiesArt() {
  // Legacy — show the Entry Level bag as fallback
  return <img src="/Mana-mint-blue-bag-front.png" alt="Repack" style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'contain' }} />
}

function RelicsAwakenedArt() {
  // Legacy — show the Rare Reserve bag as fallback
  return <img src="/Mana-Mint-green-bag-front.png" alt="Repack" style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'contain' }} />
}

function GenericResealedArt({ name }) {
  return (
    <div style={{
      width: '100%', aspectRatio: '3/4',
      background: 'linear-gradient(160deg,#0f0f1a 0%,#1a1435 55%,#0f1a14 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, rgba(139,92,246,.1) 0%, transparent 65%)' }} />
      <div style={{ fontSize: '2.8rem', marginBottom: 10 }}></div>
      <div style={{ fontSize: '.65rem', fontWeight: 900, letterSpacing: '.14em', color: '#a78bfa', textTransform: 'uppercase', textAlign: 'center', maxWidth: '80%', lineHeight: 1.45 }}>{name}</div>
    </div>
  )
}

function SealedPackArt({ name, productFormat }) {
  return (
    <div style={{
      width: '100%', aspectRatio: '3/4',
      background: 'linear-gradient(160deg,#0f1a2e 0%,#162040 55%,#0f1a0f 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, rgba(59,130,246,.1) 0%, transparent 65%)' }} />
      <div style={{ fontSize: '2.8rem', marginBottom: 10 }}></div>
      <div style={{ fontSize: '.65rem', fontWeight: 900, letterSpacing: '.12em', color: '#60a5fa', textTransform: 'uppercase', textAlign: 'center', maxWidth: '80%', lineHeight: 1.45 }}>{name}</div>
      {productFormat && (
        <div style={{ fontSize: '.5rem', color: 'rgba(96,165,250,.55)', marginTop: 6, letterSpacing: '.1em', textTransform: 'uppercase' }}>{productFormat}</div>
      )}
    </div>
  )
}

//  Sealed product card 
function SealedCard({ listing, onAdd, inCart, onView }) {
  const stockColor = listing.qty_available <= 2 ? '#f87171' : listing.qty_available <= 5 ? '#fb923c' : '#4ade80'
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${inCart ? 'var(--accent-gold)' : 'rgba(59,130,246,.2)'}`,
      borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: inCart ? '0 0 0 1px var(--accent-gold)' : '0 4px 20px rgba(59,130,246,.06)',
    }}>
      <div onClick={() => onView(listing)} style={{ cursor: 'pointer' }}>
        {listing.img_url
          ? <img src={listing.img_url} alt={listing.name} style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'cover' }} />
          : <SealedPackArt name={listing.name} productFormat={listing.product_format} />}
      </div>
      <div style={{ padding: '10px 12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div onClick={() => onView(listing)} style={{ fontWeight: 700, fontSize: '.85rem', lineHeight: 1.3, cursor: 'pointer', color: 'var(--text-primary)' }}>{listing.name}</div>
        {listing.set_name && <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{listing.set_name}</div>}
        {listing.product_format && (
          <span style={{ fontSize: '.6rem', fontWeight: 700, background: 'rgba(59,130,246,.12)', color: '#60a5fa', borderRadius: 4, padding: '2px 6px', alignSelf: 'flex-start' }}>
            {listing.product_format}
          </span>
        )}
        <div style={{ fontSize: '.6rem', color: stockColor, fontWeight: 600 }}>
          {listing.qty_available === 1 ? '1 in stock' : `${listing.qty_available} in stock`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent-gold)' }}>{fmt(listing.price)}</div>
          <button onClick={() => onAdd(listing)} style={{
            padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: '.72rem', fontWeight: 700,
            background: inCart ? 'rgba(30,196,166,.2)' : 'var(--accent-gold)',
            color: inCart ? 'var(--accent-gold)' : '#fff', transition: 'all .15s',
          }}>{inCart ? '✓ In Cart' : '+ Cart'}</button>
        </div>
      </div>
    </div>
  )
}

//  Resealed product card 
function ResealedCard({ listing, onAdd, inCart, onView }) {
  const stockColor = listing.qty_available <= 2 ? '#f87171' : listing.qty_available <= 5 ? '#fb923c' : '#4ade80'
  const getPackArt = () => {
    const n = listing.name.toLowerCase()
    if (n.includes('vaulted rarities')) return <VaultedRaritiesArt />
    if (n.includes('relics awakened'))  return <RelicsAwakenedArt />
    return <GenericResealedArt name={listing.name} />
  }
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${inCart ? 'var(--accent-gold)' : 'rgba(139,92,246,.25)'}`,
      borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      transition: 'border-color .15s, box-shadow .15s',
      boxShadow: inCart ? '0 0 0 1px var(--accent-gold)' : '0 4px 20px rgba(139,92,246,.08)',
    }}>
      <div onClick={() => onView(listing)} style={{ cursor: 'pointer', position: 'relative' }}>
        {listing.img_url
          ? <img src={listing.img_url} alt={listing.name} style={{ width: '100%', display: 'block', aspectRatio: '3/4', objectFit: 'cover' }} />
          : getPackArt()}
        {listing.qty_available <= 5 && listing.qty_available > 0 && (
          <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(249,115,22,.9)', color: '#fff', fontSize: '.58rem', fontWeight: 800, padding: '3px 7px', borderRadius: 4, letterSpacing: '.04em' }}>
            ALMOST GONE
          </div>
        )}
      </div>
      <div style={{ padding: '10px 12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div onClick={() => onView(listing)} style={{ fontWeight: 800, fontSize: '.88rem', lineHeight: 1.3, cursor: 'pointer', color: 'var(--text-primary)' }}>{listing.name}</div>
        {listing.description && (
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {listing.description.length > 85 ? listing.description.slice(0, 85) + '…' : listing.description}
          </div>
        )}
        <span style={{ fontSize: '.6rem', fontWeight: 700, background: 'rgba(139,92,246,.12)', color: '#a78bfa', borderRadius: 4, padding: '2px 6px', alignSelf: 'flex-start' }}>
           Resealed Pack
        </span>
        <div style={{ fontSize: '.6rem', color: stockColor, fontWeight: 600 }}>
          {listing.qty_available === 1 ? '1 in stock' : `${listing.qty_available} in stock`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 6 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent-gold)' }}>{fmt(listing.price)}</div>
          <button onClick={() => onAdd(listing)} style={{
            padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: '.72rem', fontWeight: 700,
            background: inCart ? 'rgba(30,196,166,.2)' : 'var(--accent-gold)',
            color: inCart ? 'var(--accent-gold)' : '#fff', transition: 'all .15s',
          }}>{inCart ? '✓ In Cart' : '+ Cart'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Resealed Showcase ────────────────────────────────────────────────────────
//
// mana-mint-resealed-background.png (1672×941) shows three bags side by side:
//   Left   — Entry Level   (blue bag,  $35)
//   Center — Rare Reserve  (green bag, $75)  ← MOST POPULAR
//   Right  — Mythic Cache  (white bag, $125)
//
// We match listings by name substring and layer click zones over each bag.
// Hovering shows a glowing ring + label; clicking opens the product modal.

const SHOWCASE_SLOTS = [
  {
    key:    'entry',
    label:  'Entry Level',
    tier:   '$35',
    // click zone — left column
    zone:   { left: '2%', top: '13%', width: '30%', bottom: '8%' },
    color:  '#3b82f6',   // blue accent matching the bag
  },
  {
    key:    'rare',
    label:  'Rare Reserve',
    tier:   '$75',
    badge:  'Most Popular',
    // click zone — center column, taller (most popular badge pushes it up)
    zone:   { left: '34%', top: '8%', width: '32%', bottom: '8%' },
    color:  '#1ec4a6',   // mint accent matching the bag
  },
  {
    key:    'mythic',
    label:  'Mythic Cache',
    tier:   '$125',
    // click zone — right column
    zone:   { left: '68%', top: '13%', width: '30%', bottom: '8%' },
    color:  '#a78bfa',   // purple accent matching the white/premium bag
  },
]

function ResealedShowcase({ listings, cartIds, onAdd, onView }) {
  const [hoveredIdx, setHoveredIdx] = useState(null)

  // Match each slot to a listing by name substring
  const slotListings = SHOWCASE_SLOTS.map(slot =>
    listings.find(l => l.name?.toLowerCase().includes(slot.key)) || null
  )

  return (
    <div style={{
      position: 'relative', userSelect: 'none', overflow: 'hidden',
      height: 'calc(100dvh - 56px)',
    }}>
      {/* Background image */}
      <img
        src="/mana-mint-resealed-background.png"
        alt="Mana Mint Premium Repacks"
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
        draggable={false}
      />

      {/* Clickable zones over each bag */}
      {SHOWCASE_SLOTS.map((slot, i) => {
        const listing = slotListings[i]
        const isHovered = hoveredIdx === i
        const inCart = listing && cartIds?.has(listing.id)
        const { zone, color, label } = slot

        return (
          <div
            key={slot.key}
            onClick={() => listing && onView(listing)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{
              position: 'absolute',
              left: zone.left, top: zone.top,
              width: zone.width, bottom: zone.bottom,
              cursor: listing ? 'pointer' : 'default',
              borderRadius: 16,
              border: isHovered ? `2px solid ${color}` : '2px solid transparent',
              boxShadow: isHovered ? `0 0 32px ${color}44, inset 0 0 24px ${color}11` : 'none',
              transition: 'border-color .2s, box-shadow .2s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingBottom: '12%',
            }}
          >
            {/* Hover label */}
            {isHovered && listing && (
              <div style={{
                background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(10px)',
                border: `1px solid ${color}66`,
                borderRadius: 99, padding: '6px 18px',
                fontSize: '.72rem', fontWeight: 700, color: '#fff',
                letterSpacing: '.04em', whiteSpace: 'nowrap',
                pointerEvents: 'none',
                animation: 'fadeInUp .15s ease',
              }}>
                {inCart ? '✓ In Cart — click to view' : `Tap to Explore ${label}`}
              </div>
            )}
          </div>
        )
      })}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ─── End Resealed Showcase ────────────────────────────────────────────────────

// Front + back image map — keyed by substring of listing.name (lowercase).
// Matches: "entry" → blue bag, "rare" → green bag, "mythic" → white bag
const RESEALED_IMAGES = {
  'entry':           { front: '/Mana-mint-blue-bag-front.png',    back: '/Mana-mint-blue-bag-back.png'    },
  'rare':            { front: '/Mana-Mint-green-bag-front.png',   back: '/Mana-mint-green-bag-back.png'   },
  'mythic':          { front: '/Mana-Mint-White-bag-front.png',   back: '/Mana-Mint-White-bag-back.png'   },
  // Legacy fallbacks for any old listings still in the DB
  'legendary cache': { front: '/Mana-Mint-White-bag-front.png',   back: '/Mana-Mint-White-bag-back.png'   },
  'treasure vault':  { front: '/Mana-mint-blue-bag-front.png',    back: '/Mana-mint-blue-bag-back.png'    },
  'vault hunter':    { front: '/Mana-Mint-green-bag-front.png',   back: '/Mana-mint-green-bag-back.png'   },
}

function getResealedImages(name = '') {
  const n = name.toLowerCase()
  const entry = Object.entries(RESEALED_IMAGES).find(([key]) => n.includes(key))
  return entry ? entry[1] : null
}

//  Product detail modal (sealed / resealed — no Scryfall data)
function ProductDetailModal({ listing, onClose, onAdd, inCart }) {
  const [imgSide, setImgSide] = useState('front')

  const stockColor = listing.qty_available <= 2 ? '#f87171' : listing.qty_available <= 5 ? '#fb923c' : '#4ade80'
  const getPackArt = () => {
    const n = listing.name.toLowerCase()
    if (n.includes('vaulted rarities')) return <VaultedRaritiesArt />
    if (n.includes('relics awakened'))  return <RelicsAwakenedArt />
    if ((listing.product_type || 'single') === 'resealed') return <GenericResealedArt name={listing.name} />
    return <SealedPackArt name={listing.name} productFormat={listing.product_format} />
  }
  const isResealed = (listing.product_type || 'single') === 'resealed'
  const resealedImgs = isResealed ? getResealedImages(listing.name) : null
  // Which image src to show right now
  const heroSrc = resealedImgs
    ? resealedImgs[imgSide]
    : (listing.img_url || null)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: isResealed ? 'min(900px,96vw)' : 'min(600px,96vw)',
        maxHeight: '94vh', overflowY: 'auto',
        background: 'var(--bg-primary)',
        border: isResealed ? '1px solid rgba(30,196,166,.35)' : '1px solid var(--border)',
        borderRadius: 20, zIndex: 401, padding: 0,
        boxShadow: isResealed ? '0 32px 80px rgba(0,0,0,.8), 0 0 0 1px rgba(30,196,166,.1)' : '0 24px 60px rgba(0,0,0,.65)',
      }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14, zIndex: 10,
          background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: '50%',
          width: 34, height: 34, cursor: 'pointer', color: '#fff', fontSize: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(6px)',
        }}>✕</button>

        {isResealed ? (
          /* ── Resealed: image fills the entire modal, overlays for toggle + CTA ── */
          <div style={{ position: 'relative', background: '#0c0c0c', borderRadius: 20, overflow: 'hidden' }}>
            {/* Bag image — sized to fill the modal without scrolling */}
            {heroSrc
              ? <img
                  key={heroSrc}
                  src={heroSrc}
                  alt={`${listing.name} — ${imgSide}`}
                  style={{ width: '100%', maxHeight: '90vh', objectFit: 'contain', display: 'block' }}
                />
              : <div style={{ padding: '32px 24px' }}>{getPackArt()}</div>
            }

            {/* Front / Back toggle — centre-bottom of image */}
            {resealedImgs && (
              <div style={{
                position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', gap: 6,
                background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(10px)',
                borderRadius: 99, padding: '4px 6px',
                border: '1px solid rgba(255,255,255,.12)',
              }}>
                {['front', 'back'].map(side => (
                  <button
                    key={side}
                    onClick={() => setImgSide(side)}
                    style={{
                      padding: '7px 22px', borderRadius: 99, border: 'none', cursor: 'pointer',
                      fontWeight: 700, fontSize: '.75rem', letterSpacing: '.05em', textTransform: 'uppercase',
                      background: imgSide === side ? 'var(--accent-gold)' : 'transparent',
                      color: imgSide === side ? '#000' : 'rgba(255,255,255,.55)',
                      transition: 'all .15s',
                    }}
                  >{side}</button>
                ))}
              </div>
            )}

            {/* Action bar — frosted strip pinned to the bottom edge */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(14px)',
              borderTop: '1px solid rgba(30,196,166,.2)',
              padding: '10px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontWeight: 900, fontSize: '1.6rem', color: 'var(--accent-gold)', lineHeight: 1 }}>{fmt(listing.price)}</div>
                <div style={{ fontSize: '.68rem', fontWeight: 600, color: stockColor }}>
                  {listing.qty_available === 1 ? '1 in stock' : `${listing.qty_available} in stock`}
                </div>
              </div>
              <button onClick={() => { if (!inCart) onAdd(listing); onClose() }} style={{
                padding: '11px 28px', borderRadius: 12, border: 'none', cursor: inCart ? 'default' : 'pointer',
                background: inCart ? 'rgba(30,196,166,.2)' : 'var(--accent-gold)',
                color: inCart ? 'var(--accent-gold)' : '#fff', fontWeight: 900, fontSize: '.95rem',
                letterSpacing: '.01em', whiteSpace: 'nowrap',
              }}>{inCart ? '✓ In Cart' : '+ Add to Cart'}</button>
            </div>
          </div>
        ) : (
          /* ── Singles / Sealed: original side-by-side layout, slightly larger ── */
          <div style={{ padding: '20px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ width: 'min(200px,42vw)', flexShrink: 0, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 28px rgba(0,0,0,.6)' }}>
              {listing.img_url
                ? <img src={listing.img_url} alt={listing.name} style={{ width: '100%', display: 'block' }} />
                : getPackArt()}
            </div>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 24 }}>
              <div style={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.25 }}>{listing.name}</div>
              {listing.set_name && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{listing.set_name}</div>}
              {listing.product_format && (
                <span style={{ fontSize: '.7rem', fontWeight: 700, background: 'rgba(59,130,246,.12)', color: '#60a5fa', borderRadius: 6, padding: '3px 8px', alignSelf: 'flex-start' }}>
                  {listing.product_format}
                </span>
              )}
              {listing.description && (
                <div style={{ fontSize: '.82rem', lineHeight: 1.7, color: 'var(--text-secondary)', padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
                  {listing.description}
                </div>
              )}
              <div style={{ fontSize: '.72rem', fontWeight: 600, color: stockColor }}>
                {listing.qty_available === 1 ? '1 in stock' : `${listing.qty_available} in stock`}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: 4 }}>
                <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--accent-gold)' }}>{fmt(listing.price)}</div>
                <button onClick={() => { if (!inCart) onAdd(listing); onClose() }} style={{
                  padding: '10px 22px', borderRadius: 10, border: 'none', cursor: inCart ? 'default' : 'pointer',
                  background: inCart ? 'rgba(30,196,166,.15)' : 'var(--accent-gold)',
                  color: inCart ? 'var(--accent-gold)' : '#fff', fontWeight: 800, fontSize: '.88rem',
                }}>{inCart ? '✓ In Cart' : '+ Add to Cart'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

//  Cart drawer 
function CartDrawer({ cart, onClose, onRemove, onQtyChange, onCheckout, shippingCost }) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const total    = subtotal + shippingCost

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
          zIndex: 200,
        }}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(360px, 100vw)',
        background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)',
        zIndex: 201, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}> Cart ({cart.length})</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}></div>
              <div>Your cart is empty</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.map(item => (
                <div key={item.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  background: 'var(--bg-card)', borderRadius: 10,
                  padding: '8px 10px', border: '1px solid var(--border)',
                }}>
                  {item.img_url
                    ? <img src={item.img_url} alt={item.name} style={{ width: 36, borderRadius: 4, flexShrink: 0 }} />
                    : <div style={{ width: 36, height: 50, background: 'var(--bg-hover)', borderRadius: 4, flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '.78rem', lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{item.condition}{item.is_foil ? ' · ' : ''}</div>
                    <div style={{ fontWeight: 800, fontSize: '.82rem', color: 'var(--accent-gold)', marginTop: 2 }}>
                      {fmt(item.price * item.qty)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => onQtyChange(item.id, item.qty - 1)} style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 4, background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ fontSize: '.78rem', fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                      <button
                        onClick={() => onQtyChange(item.id, item.qty + 1)}
                        disabled={item.qty >= (item.maxQty || 99)}
                        style={{
                          width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 4,
                          background: 'none', fontSize: '.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: item.qty >= (item.maxQty || 99) ? 'var(--text-muted)' : 'var(--text-secondary)',
                          cursor: item.qty >= (item.maxQty || 99) ? 'not-allowed' : 'pointer',
                          opacity: item.qty >= (item.maxQty || 99) ? 0.4 : 1,
                        }}
                      >+</button>
                    </div>
                    {item.qty >= (item.maxQty || 99) && (
                      <span style={{ fontSize: '.55rem', color: '#f87171', fontWeight: 700, letterSpacing: '.3px' }}>MAX</span>
                    )}
                    <button onClick={() => onRemove(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '.65rem', cursor: 'pointer' }}>remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
              <span>Shipping</span><span>{fmt(shippingCost)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1rem', marginBottom: 14 }}>
              <span>Total</span><span style={{ color: 'var(--accent-gold)' }}>{fmt(total)}</span>
            </div>
            <button
              onClick={onCheckout}
              style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: 'var(--accent-gold)', color: '#000',
                fontWeight: 800, fontSize: '.9rem', cursor: 'pointer',
              }}
            >
              Checkout →
            </button>
          </div>
        )}
      </div>
    </>
  )
}

//  Checkout: payment form (inner — needs Stripe context) 
function PaymentForm({ onSuccess, onBack, total }) {
  const stripe    = useStripe()
  const elements  = useElements()
  const [paying,  setPaying]  = useState(false)
  const [error,   setError]   = useState(null)

  const handlePay = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    setError(null)
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })
    if (err) {
      setError(err.message)
      setPaying(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handlePay}>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, color: '#fca5a5', fontSize: '.8rem' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onBack} style={{
          flex: '0 0 auto', padding: '13px 18px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'transparent',
          color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.88rem', fontWeight: 600,
        }}>← Back</button>
        <button type="submit" disabled={!stripe || paying} style={{
          flex: 1, padding: 13, borderRadius: 12, border: 'none',
          background: paying ? 'rgba(74,222,128,.5)' : '#22c55e',
          color: '#000', fontWeight: 800, fontSize: '.9rem',
          cursor: paying ? 'not-allowed' : 'pointer',
        }}>
          {paying ? 'Processing…' : `Pay ${fmt(total)}`}
        </button>
      </div>
    </form>
  )
}

//  Checkout modal 
function CheckoutModal({ cart, onClose, onSuccess, shippingCost }) {
  const [step,         setStep]         = useState('shipping') // shipping | payment | success
  const [clientSecret, setClientSecret] = useState(null)
  const [orderTotal,   setOrderTotal]   = useState(0)
  const [creatingPI,   setCreatingPI]   = useState(false)
  const [piError,      setPiError]      = useState(null)
  const [shipping,     setShipping]     = useState({
    name: '', email: '', line1: '', city: '', state: '', zip: '', country: 'US',
  })

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)

  const handleShippingSubmit = async (e) => {
    e.preventDefault()
    setCreatingPI(true)
    setPiError(null)
    try {
      const res  = await fetch('/.netlify/functions/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items:    cart.map(i => ({ id: i.id, qty: i.qty })),
          shipping,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setClientSecret(data.clientSecret)
      setOrderTotal(data.total)
      setStep('payment')
    } catch (err) {
      setPiError(err.message)
    } finally {
      setCreatingPI(false)
    }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label style={{ display: 'block', fontSize: '.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
        {label}
      </label>
      <input
        type={type}
        required
        placeholder={placeholder}
        value={shipping[key]}
        onChange={e => setShipping(s => ({ ...s, [key]: e.target.value }))}
        className="form-input"
        style={{ width: '100%', padding: '10px 12px', fontSize: '.85rem', boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(480px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 301, padding: '24px 24px 28px',
        boxShadow: '0 24px 60px rgba(0,0,0,.5)',
      }}>

        {/*  Success  */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}></div>
            <div style={{ fontWeight: 800, fontSize: '1.4rem', marginBottom: 8 }}>Order Confirmed!</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '.88rem', marginBottom: 6 }}>
              Thanks, {shipping.name.split(' ')[0]}! We'll email you a shipping update at
            </div>
            <div style={{ fontWeight: 600, color: 'var(--accent-gold)', marginBottom: 28 }}>{shipping.email}</div>
            <button
              onClick={() => { onSuccess(); onClose() }}
              style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'var(--accent-gold)', color: '#000', fontWeight: 800, fontSize: '.9rem', cursor: 'pointer' }}
            >
              Continue Shopping
            </button>
          </div>
        )}

        {/*  Shipping form  */}
        {step === 'shipping' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Checkout</div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Order summary */}
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 8 }}>Order Summary</div>
              {cart.map(i => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{i.name} ×{i.qty}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(i.price * i.qty)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                <span>Shipping</span><span>{fmt(shippingCost)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '.9rem', marginTop: 4 }}>
                <span>Total</span>
                <span style={{ color: 'var(--accent-gold)' }}>{fmt(subtotal + shippingCost)}</span>
              </div>
            </div>

            <form onSubmit={handleShippingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {field('Full Name', 'name', 'text', 'Jane Smith')}
              {field('Email', 'email', 'email', 'jane@example.com')}
              {field('Street Address', 'line1', 'text', '123 Main St')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: 10 }}>
                {field('City', 'city', 'text', 'Portland')}
                {field('State', 'state', 'text', 'OR')}
                {field('ZIP', 'zip', 'text', '97201')}
              </div>

              {piError && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, color: '#fca5a5', fontSize: '.8rem' }}>
                  {piError}
                </div>
              )}

              <button type="submit" disabled={creatingPI} style={{
                padding: 14, borderRadius: 12, border: 'none', marginTop: 4,
                background: creatingPI ? 'rgba(30,196,166,.5)' : 'var(--accent-gold)',
                color: '#000', fontWeight: 800, fontSize: '.9rem',
                cursor: creatingPI ? 'not-allowed' : 'pointer',
              }}>
                {creatingPI ? 'Preparing…' : 'Continue to Payment →'}
              </button>
            </form>
          </>
        )}

        {/*  Payment step  */}
        {step === 'payment' && clientSecret && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Payment</div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#16a389',
                    colorBackground: '#111',
                    colorText: '#e2e8f0',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <PaymentForm
                total={orderTotal}
                onBack={() => setStep('shipping')}
                onSuccess={() => setStep('success')}
              />
            </Elements>
          </>
        )}
      </div>
    </>
  )
}

//  Waitlist modal 
function WaitlistModal({ listing, user, onClose }) {
  const [email,   setEmail]   = useState(user?.email || '')
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [err,     setErr]     = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setSaving(true); setErr(null)
    try {
      const { error: insErr } = await supabase.from('waitlist').upsert(
        { listing_id: listing.id, email: email.trim().toLowerCase() },
        { onConflict: 'listing_id,email', ignoreDuplicates: true }
      )
      if (insErr) throw new Error(insErr.message)
      setDone(true)
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 410 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(380px,92vw)', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 18, zIndex: 411, padding: '24px 22px 28px', boxShadow: '0 24px 60px rgba(0,0,0,.65)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: '#fff', fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}></div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>You're on the list!</div>
            <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>We'll email <strong>{email}</strong> when <em>{listing.name}</em> is back in stock.</div>
            <button onClick={onClose} style={{ marginTop: 18, padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--accent-gold)', color: '#000', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}> Notify Me</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Get an email when <strong style={{ color: 'var(--text-primary)' }}>{listing.name}</strong> is back in stock.
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                type="email" required placeholder="your@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                className="form-input"
                style={{ padding: '10px 14px', fontSize: '.88rem' }}
              />
              {err && <div style={{ fontSize: '.75rem', color: '#fca5a5' }}> {err}</div>}
              <button type="submit" disabled={saving} style={{ padding: '11px', borderRadius: 10, border: 'none', background: 'var(--accent-gold)', color: '#000', fontWeight: 800, fontSize: '.88rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Notify Me When Available'}
              </button>
            </form>
          </>
        )}
      </div>
    </>
  )
}

//  Main Store page 
export default function Store({ initialSearch = '', onSearchUsed, user }) {
  const [listings,        setListings]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [search,          setSearch]          = useState(initialSearch)

  // Pre-populate search when navigated from Card Lookup's "Buy from Vaulted Singles"
  useEffect(() => {
    if (initialSearch) { setSearch(initialSearch); onSearchUsed?.() }
  }, [initialSearch]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sortBy,          setSortBy]          = useState('name')
  const [cart,            setCart]            = useState(loadCart)
  const [cartOpen,        setCartOpen]        = useState(false)
  const [checkoutOpen,    setCheckoutOpen]    = useState(false)
  const [selectedListing, setSelectedListing] = useState(null)
  const [waitlistListing, setWaitlistListing] = useState(null)
  const [category,        setCategory]        = useState('single')
  const [topbarEl,        setTopbarEl]        = useState(null)
  useEffect(() => { setTopbarEl(document.getElementById('topbar')) }, [])

  // Singles filters
  const [priceMin,        setPriceMin]        = useState('')
  const [priceMax,        setPriceMax]        = useState('')
  const [condFilter,      setCondFilter]      = useState([]) // [] = all
  const [foilFilter,      setFoilFilter]      = useState('all') // 'all'|'foil'|'nonfoil'
  const [filterColors,    setFilterColors]    = useState([])
  const [filterRarity,    setFilterRarity]    = useState(null)
  const [filterType,      setFilterType]      = useState(null)
  const [cardDataCache,   setCardDataCache]   = useState({}) // scryfall_id -> {colors,rarity,typeLine}
  const [dataLoading,     setDataLoading]     = useState(false)
  const [showFilters,     setShowFilters]     = useState(false)

  // On the Resealed tab, strip all #content padding so the showcase image
  // sits flush against the topbar — no gap anywhere. Restored on unmount or tab change.
  useEffect(() => {
    const el = document.getElementById('content')
    if (!el) return
    if (category === 'resealed') {
      el.style.padding = '0'
    } else {
      el.style.padding = ''
    }
    return () => { el.style.padding = '' }
  }, [category])

  // Dynamic shipping from admin settings
  const [shippingCost,    setShippingCost]    = useState(DEFAULT_SHIPPING)
  const [handlingFee,     setHandlingFee]     = useState(0)

  useEffect(() => {
    supabase
      .from('store_settings')
      .select('key, value')
      .in('key', ['shipping_cost', 'handling_fee'])
      .then(({ data }) => {
        if (!data) return
        const map = Object.fromEntries(data.map(r => [r.key, parseFloat(r.value) || 0]))
        if (map.shipping_cost != null) setShippingCost(map.shipping_cost)
        if (map.handling_fee  != null) setHandlingFee(map.handling_fee)
      })
  }, [])

  // Derived: total shipping displayed in cart / checkout
  const SHIPPING_COST = shippingCost + handlingFee

  // Lazy-fetch color/rarity/type from Scryfall when filter panel opens
  useEffect(() => {
    if (!showFilters || category !== 'single') return
    const singles = listings.filter(l => (l.product_type || 'single') === 'single' && l.scryfall_id)
    const uncached = singles.filter(l => !(l.scryfall_id in cardDataCache))
    if (uncached.length === 0) return
    setDataLoading(true)
    const ids = uncached.map(l => l.scryfall_id)
    const batches = []
    for (let i = 0; i < ids.length; i += 75) batches.push(ids.slice(i, i + 75))
    Promise.all(batches.map(batch =>
      fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(id => ({ id })) }),
      }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    )).then(results => {
      const newEntries = {}
      results.forEach(r => {
        ;(r.data || []).forEach(card => {
          const typeLine = (card.type_line || '').split(' // ')[0]
          newEntries[card.id] = {
            colors:   card.colors || card.card_faces?.[0]?.colors || [],
            rarity:   card.rarity || '',
            typeLine,
          }
        })
      })
      setCardDataCache(prev => ({ ...prev, ...newEntries }))
      setDataLoading(false)
    })
  }, [showFilters, category, listings.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch active listings + subscribe to real-time changes so prices/qty stay live
  useEffect(() => {
    supabase
      .from('store_listings')
      .select('*')
      .eq('active', true)
      .order('name')
      .then(({ data }) => {
        setListings(data || [])
        setLoading(false)
      })

    const channel = supabase
      .channel('store-listings-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_listings' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          setListings(prev => {
            // If the row was deactivated, remove it from the list
            if (!payload.new.active) return prev.filter(l => l.id !== payload.new.id)
            const idx = prev.findIndex(l => l.id === payload.new.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = payload.new
              return next
            }
            // New row became active — insert and keep sorted
            return [...prev, payload.new].sort((a, b) => a.name.localeCompare(b.name))
          })
        } else if (payload.eventType === 'INSERT') {
          if (payload.new.active) {
            setListings(prev => [...prev, payload.new].sort((a, b) => a.name.localeCompare(b.name)))
          }
        } else if (payload.eventType === 'DELETE') {
          setListings(prev => prev.filter(l => l.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Shareable URL: read ?product=<id> on mount, auto-open modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const productId = params.get('product')
    if (productId && listings.length > 0) {
      const found = listings.find(l => l.id === productId)
      if (found) setSelectedListing(found)
    }
  }, [listings])

  // Update URL when a product modal opens/closes
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedListing) {
      url.searchParams.set('product', selectedListing.id)
    } else {
      url.searchParams.delete('product')
    }
    window.history.replaceState({}, '', url.toString())
  }, [selectedListing])

  // Persist cart to localStorage
  useEffect(() => { saveCart(cart) }, [cart])

  const cartIds = useMemo(() => new Set(cart.map(i => i.id)), [cart])

  const CONDITIONS_LIST = ['NM', 'LP', 'MP', 'HP', 'DMG']

  const filtered = useMemo(() => {
    let list = listings.filter(l => {
      const type = l.product_type || 'single'
      if (type !== category) return false
      // Only show in-stock items in the main grid (out-of-stock handled separately below)
      if (l.qty_available <= 0) return false
      if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.set_name?.toLowerCase().includes(search.toLowerCase())) return false
      // Singles-only filters
      if (category === 'single') {
        if (priceMin !== '' && parseFloat(l.price) < parseFloat(priceMin)) return false
        if (priceMax !== '' && parseFloat(l.price) > parseFloat(priceMax)) return false
        if (condFilter.length > 0 && !condFilter.includes(l.condition)) return false
        if (foilFilter === 'foil'    && !l.is_foil) return false
        if (foilFilter === 'nonfoil' &&  l.is_foil) return false
        const cd = l.scryfall_id ? cardDataCache[l.scryfall_id] : null
        if (filterColors.length > 0) {
          if (!cd) return true // not yet fetched — keep visible while loading
          if (!filterColors.some(col => (cd.colors || []).includes(col))) return false
        }
        if (filterRarity) {
          if (!cd) return true
          if (cd.rarity !== filterRarity) return false
        }
        if (filterType) {
          if (!cd) return true
          if (!(cd.typeLine || '').includes(filterType)) return false
        }
      }
      return true
    })
    if (sortBy === 'price_asc')  list = [...list].sort((a, b) => a.price - b.price)
    if (sortBy === 'price_desc') list = [...list].sort((a, b) => b.price - a.price)
    if (sortBy === 'name')       list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'newest')     list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return list
  }, [listings, search, sortBy, category, priceMin, priceMax, condFilter, foilFilter, filterColors, filterRarity, filterType, cardDataCache])

  // Separate out-of-stock list for the same category (for waitlist section)
  const outOfStock = useMemo(() => {
    return listings.filter(l => {
      const type = l.product_type || 'single'
      return type === category && l.qty_available <= 0
    })
  }, [listings, category])

  const hasActiveFilters = priceMin !== '' || priceMax !== '' || condFilter.length > 0 || foilFilter !== 'all' || filterColors.length > 0 || filterRarity != null || filterType != null

  const addToCart = useCallback((listing) => {
    setCart(prev => {
      const exists = prev.find(i => i.id === listing.id)
      if (exists) return prev // already in cart
      return [...prev, {
        id:        listing.id,
        name:      listing.name,
        price:     listing.price,
        qty:       1,
        maxQty:    listing.qty_available,
        img_url:   listing.img_url,
        condition: listing.condition,
        is_foil:   listing.is_foil,
      }]
    })
  }, [])

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }, [])

  const changeQty = useCallback((id, qty) => {
    if (qty < 1) { removeFromCart(id); return }
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i
      const max = i.maxQty || 99
      return { ...i, qty: Math.min(qty, max) }
    }))
  }, [removeFromCart])

  const cartCount = cart.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0)

  return (
    <div style={{ paddingBottom: category === 'resealed' ? 0 : (cartCount > 0 ? 100 : 80) }}>
      {/*  Header — hidden on Resealed tab to give the showcase full vertical space */}
      {category !== 'resealed' && (
        <div style={{
          background: 'linear-gradient(135deg,#0f172a 0%,#1a1200 100%)',
          borderRadius: 14, padding: '18px 20px', marginBottom: 20,
          border: '1px solid rgba(30,196,166,.2)',
          boxShadow: '0 4px 20px rgba(30,196,166,.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: '.15em', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 4 }}>
              Mana Mint
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.5px' }}>
               Card Shop
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
              {loading ? 'Loading…' : `${filtered.length} ${category === 'single' ? 'card' : 'product'}${filtered.length !== 1 ? 's' : ''} available`}
            </div>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            style={{
              position: 'relative', padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--accent-gold)', background: cartCount > 0 ? 'rgba(30,196,166,.15)' : 'transparent',
              color: 'var(--accent-gold)', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer',
            }}
          >
             Cart
            {cartCount > 0 && (
              <span style={{
                position: 'absolute', top: -8, right: -8,
                background: 'var(--accent-gold)', color: '#000',
                borderRadius: '50%', width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.65rem', fontWeight: 900,
              }}>{cartCount}</span>
            )}
          </button>
        </div>
      )}

      {/*  Category tabs
            On Resealed: portalled into #topbar so they sit on the same row as the logo.
            On Singles/Sealed: rendered here in the normal flow with the underline border. */}
      {(() => {
        const TABS = [
          { id: 'single',   label: 'Singles'  },
          { id: 'sealed',   label: 'Sealed'   },
          { id: 'resealed', label: 'Resealed' },
        ]
        if (category === 'resealed' && topbarEl) {
          return createPortal(
            <div style={{
              position: 'absolute', left: '50%', top: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex', gap: 4,
            }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => { setCategory(t.id); setSearch('') }} style={{
                  padding: '6px 16px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  background: category === t.id ? 'rgba(30,196,166,.15)' : 'transparent',
                  color: category === t.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                  fontWeight: category === t.id ? 700 : 400, fontSize: '.83rem',
                  outline: category === t.id ? '1.5px solid rgba(30,196,166,.4)' : 'none',
                  transition: 'all .15s',
                }}>{t.label}</button>
              ))}
            </div>,
            topbarEl
          )
        }
        return (
          <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setCategory(t.id); setSearch('') }} style={{
                padding: '9px 18px', borderRadius: '8px 8px 0 0', border: 'none',
                background: category === t.id ? 'rgba(30,196,166,.1)' : 'transparent',
                color: category === t.id ? 'var(--accent-gold)' : 'var(--text-muted)',
                fontWeight: category === t.id ? 700 : 400, fontSize: '.83rem', cursor: 'pointer',
                borderBottom: `2px solid ${category === t.id ? 'var(--accent-gold)' : 'transparent'}`,
                transition: 'all .15s',
              }}>{t.label}</button>
            ))}
          </div>
        )
      })()}

      {/*  Search + Sort + Filters — hidden on Resealed (only 3 products, no need) */}
      {category !== 'resealed' && <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={`Search ${category === 'single' ? 'cards' : 'products'}…`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 180, padding: '9px 14px', fontSize: '.85rem' }}
        />
        {category === 'single' && (
          <button
            onClick={() => setShowFilters(s => !s)}
            style={{
              padding: '9px 14px', borderRadius: 10,
              border: `1.5px solid ${hasActiveFilters ? 'var(--accent-gold)' : 'var(--border)'}`,
              background: hasActiveFilters ? 'rgba(30,196,166,.12)' : 'transparent',
              color: hasActiveFilters ? 'var(--accent-gold)' : 'var(--text-muted)',
              fontWeight: hasActiveFilters ? 700 : 400, fontSize: '.82rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
             Filter
            {hasActiveFilters && (
              <span style={{
                background: 'var(--accent-gold)', color: '#1a1000',
                borderRadius: '99px', padding: '0 6px', fontSize: '.65rem', fontWeight: 800, minWidth: '18px', textAlign: 'center',
              }}>
                {[priceMin !== '', priceMax !== '', condFilter.length > 0, foilFilter !== 'all', filterColors.length > 0, filterRarity != null, filterType != null].filter(Boolean).length}
              </span>
            )}
            <span style={{ opacity: 0.5, fontSize: '.65rem' }}>{showFilters ? '▲' : '▼'}</span>
          </button>
        )}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="form-input"
          style={{ padding: '9px 12px', fontSize: '.82rem', cursor: 'pointer' }}
        >
          <option value="name">Sort: Name</option>
          <option value="price_asc">Sort: Price ↑</option>
          <option value="price_desc">Sort: Price ↓</option>
          <option value="newest">Sort: Newest</option>
        </select>
      </div>}

      {/*  Singles filter panel  */}
      {category === 'single' && showFilters && (
        <div style={{
          marginBottom: 14, padding: '14px 16px', borderRadius: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>

          {/* Color */}
          <div>
            <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Color</div>
            <ChipRow options={COLOR_OPTIONS} value={filterColors} onChange={setFilterColors} multi />
          </div>

          {/* Rarity */}
          <div>
            <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Rarity</div>
            <ChipRow
              options={RARITY_OPTIONS}
              value={filterRarity}
              onChange={setFilterRarity}
              labelFn={r => ({ common: ' Common', uncommon: ' Uncommon', rare: ' Rare', mythic: ' Mythic' }[r] || r)}
            />
          </div>

          {/* Condition */}
          <div>
            <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Condition</div>
            <ChipRow options={CONDITIONS_LIST} value={condFilter} onChange={setCondFilter} multi />
          </div>

          {/* Foil */}
          <div>
            <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Finish</div>
            <ChipRow
              options={['foil', 'nonfoil']}
              value={foilFilter === 'all' ? null : foilFilter}
              onChange={v => setFoilFilter(v || 'all')}
              labelFn={v => v === 'foil' ? ' Foil' : 'Non-Foil'}
            />
          </div>

          {/* Card Type */}
          <div>
            <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Card Type
              {dataLoading && <span style={{ marginLeft: 8, fontStyle: 'italic', fontWeight: 400, textTransform: 'none' }}>fetching…</span>}
            </div>
            <ChipRow options={CARD_TYPES} value={filterType} onChange={setFilterType} />
          </div>

          {/* Price range */}
          <div>
            <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Price Range</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number" min="0" step="0.01" placeholder="Min"
                  value={priceMin} onChange={e => setPriceMin(e.target.value)}
                  className="form-input"
                  style={{ width: '72px', padding: '5px 8px', fontSize: '.78rem' }}
                />
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>–</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number" min="0" step="0.01" placeholder="Max"
                  value={priceMax} onChange={e => setPriceMax(e.target.value)}
                  className="form-input"
                  style={{ width: '72px', padding: '5px 8px', fontSize: '.78rem' }}
                />
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <button onClick={() => {
              setPriceMin(''); setPriceMax(''); setCondFilter([]); setFoilFilter('all')
              setFilterColors([]); setFilterRarity(null); setFilterType(null)
            }} style={{
              alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 6,
              border: '1px solid rgba(239,68,68,.3)', background: 'none',
              color: '#f87171', fontSize: '.72rem', cursor: 'pointer',
            }}>Clear all filters</button>
          )}
        </div>
      )}

      {/*  Loading skeletons  */}
      {loading && category !== 'resealed' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(140px,calc(50vw - 20px)),1fr))', gap: 12 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ aspectRatio: '63/120', borderRadius: 14, background: 'var(--bg-card)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* Resealed: showcase + seamless infographic scroll */}
      {category === 'resealed' && (
        <>
          <ResealedShowcase
            listings={loading ? [] : filtered.slice(0, 3)}
            cartIds={cartIds}
            onAdd={addToCart}
            onView={setSelectedListing}
          />

          {/* Infographics — full-bleed, zero gap, scroll in order below the showcase */}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 0 }}>
            <img
              src="/infographic-1.png"
              alt="What Every Repack Includes"
              style={{ width: '100%', display: 'block' }}
              draggable={false}
            />
            <img
              src="/infographic-2.png"
              alt="Compare the 3 Repacks"
              style={{ width: '100%', display: 'block' }}
              draggable={false}
            />
          </div>

          {/* Overflow products beyond the 3 arch slots */}
          {!loading && filtered.length > 3 && (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {filtered.slice(3).map(listing => (
                <ResealedCard key={listing.id} listing={listing} inCart={cartIds.has(listing.id)} onAdd={addToCart} onView={setSelectedListing} />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && search && (
            <div style={{ textAlign: 'center', paddingTop: 12, color: 'var(--text-muted)', fontSize: '.82rem' }}>
              No packs match "{search}" —{' '}
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600 }}>clear</button>
            </div>
          )}
        </>
      )}

      {/*  Empty states (singles / sealed)  */}
      {!loading && category !== 'resealed' && filtered.length === 0 && !search && (
        <div className="empty-state">
          <div className="empty-icon">{category === 'single' ? '' : ''}</div>
          <p>
            {category === 'single' && 'No singles listed yet. Check back soon!'}
            {category === 'sealed' && 'No sealed products listed yet. Check back soon!'}
          </p>
        </div>
      )}

      {!loading && category !== 'resealed' && filtered.length === 0 && search && (
        <div className="empty-state">
          <div className="empty-icon"></div>
          <p>No results for "{search}"</p>
          <button className="btn btn-ghost" onClick={() => setSearch('')} style={{ marginTop: 12 }}>Clear search</button>
        </div>
      )}

      {/*  Singles / Sealed product grid  */}
      {!loading && filtered.length > 0 && category !== 'resealed' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: category === 'single'
            ? 'repeat(auto-fill,minmax(min(140px,calc(50vw - 20px)),1fr))'
            : 'repeat(auto-fill,minmax(min(200px,calc(50vw - 20px)),1fr))',
          gap: 12,
        }}>
          {filtered.map(listing =>
            category === 'single' ? (
              <ListingCard key={listing.id} listing={listing} inCart={cartIds.has(listing.id)} onAdd={addToCart} onView={setSelectedListing} />
            ) : (
              <SealedCard key={listing.id} listing={listing} inCart={cartIds.has(listing.id)} onAdd={addToCart} onView={setSelectedListing} />
            )
          )}
        </div>
      )}

      {/*  Out-of-stock / waitlist section  */}
      {!loading && outOfStock.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: '.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
            Out of Stock — Join Waitlist
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: category === 'single'
              ? 'repeat(auto-fill,minmax(min(140px,calc(50vw - 20px)),1fr))'
              : 'repeat(auto-fill,minmax(min(200px,calc(50vw - 20px)),1fr))',
            gap: 12,
          }}>
            {outOfStock.map(listing => (
              <div key={listing.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 14, overflow: 'hidden', opacity: 0.65,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ position: 'relative' }}>
                  {listing.img_url
                    ? <img src={listing.img_url} alt={listing.name} style={{ width: '100%', display: 'block', aspectRatio: category === 'single' ? '63/88' : '3/4', objectFit: 'cover', filter: 'grayscale(40%)' }} />
                    : <div style={{ width: '100%', aspectRatio: category === 'single' ? '63/88' : '3/4', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>{category === 'single' ? '' : ''}</div>
                  }
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '.65rem', fontWeight: 800, background: 'rgba(0,0,0,.7)', color: '#f87171', borderRadius: 6, padding: '4px 10px', letterSpacing: '.06em' }}>OUT OF STOCK</span>
                  </div>
                </div>
                <div style={{ padding: '8px 10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontWeight: 700, fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>{listing.name}</div>
                  {listing.set_name && <div style={{ fontSize: '.63rem', color: 'var(--text-muted)' }}>{listing.set_name}</div>}
                  <div style={{ fontWeight: 800, fontSize: '.95rem', color: 'var(--text-muted)', marginTop: 'auto', paddingTop: 6 }}>{fmt(listing.price)}</div>
                  <button
                    onClick={() => setWaitlistListing(listing)}
                    style={{
                      marginTop: 6, padding: '7px', borderRadius: 8, border: '1px solid rgba(30,196,166,.4)',
                      background: 'transparent', color: 'var(--accent-gold)', fontWeight: 700,
                      fontSize: '.72rem', cursor: 'pointer', width: '100%',
                    }}
                  > Notify Me</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/*  Cart drawer  */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          shippingCost={SHIPPING_COST}
          onClose={() => setCartOpen(false)}
          onRemove={removeFromCart}
          onQtyChange={changeQty}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true) }}
        />
      )}

      {/*  Checkout modal  */}
      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          shippingCost={SHIPPING_COST}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={() => setCart([])}
        />
      )}

      {/*  Detail modal (single vs sealed/resealed)  */}
      {selectedListing && (
        (selectedListing.product_type || 'single') === 'single'
          ? <CardDetailModal listing={selectedListing} onClose={() => setSelectedListing(null)} onAdd={addToCart} inCart={cartIds.has(selectedListing.id)} />
          : <ProductDetailModal listing={selectedListing} onClose={() => setSelectedListing(null)} onAdd={addToCart} inCart={cartIds.has(selectedListing.id)} />
      )}

      {/*  Waitlist modal  */}
      {waitlistListing && (
        <WaitlistModal listing={waitlistListing} user={user} onClose={() => setWaitlistListing(null)} />
      )}

      {/*  Floating cart bar  */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150,
        transform: cartCount > 0 ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)',
        pointerEvents: cartCount > 0 ? 'auto' : 'none',
      }}>
        {/* inner bar — centered, max-width matches page content */}
        <div style={{
          maxWidth: 860, margin: '0 auto 12px',
          padding: '0 12px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(15,12,5,.92)',
            border: '1px solid rgba(30,196,166,.45)',
            borderRadius: 16, padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(30,196,166,.15)',
          }}>
            {/* Left: count + total */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: 'var(--accent-gold)', color: '#000',
                borderRadius: '50%', width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.72rem', fontWeight: 900, flexShrink: 0,
              }}>{cartCount}</div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1 }}>
                  {cartCount === 1 ? '1 item' : `${cartCount} items`}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-gold)', lineHeight: 1.3 }}>
                  {fmt(cartTotal)}
                </div>
              </div>
            </div>

            {/* Right: CTA */}
            <button
              onClick={() => setCartOpen(true)}
              style={{
                padding: '10px 22px', borderRadius: 12, border: 'none',
                background: 'var(--accent-gold)', color: '#000',
                fontWeight: 800, fontSize: '.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 12px rgba(30,196,166,.35)',
              }}
            >
               View Cart →
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:.4; } 50% { opacity:.8; } }
      `}</style>
    </div>
  )
}
