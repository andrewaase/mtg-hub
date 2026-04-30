import { useState, useEffect, useMemo, useCallback } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '')
const CART_KEY      = 'vs-cart-v1'
const SHIPPING_COST = 0

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Price history chart (pure SVG, no external deps) ────────────────────────
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
        <div style={{ fontSize: '1.4rem', marginBottom: 5 }}>📈</div>
        Price tracking begins today — check back after the next daily sync!
      </div>
    )
  }

  // ── Layout constants ──────────────────────────────────────────────────────
  const W = 500, H = 140
  const PAD = { top: 14, right: 12, bottom: 28, left: 44 }
  const cW  = W - PAD.left - PAD.right
  const cH  = H - PAD.top  - PAD.bottom

  // ── Scale helpers ─────────────────────────────────────────────────────────
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

  // ── Grid lines (4 horizontal) ─────────────────────────────────────────────
  const gridLines = [0, 0.33, 0.67, 1].map(f => ({
    y:     PAD.top + (1 - f) * cH,
    label: `$${(pMin + f * pFull).toFixed(2)}`,
  }))

  // ── X-axis: up to 5 evenly-spaced date labels ─────────────────────────────
  const xIdxs = history.length <= 5
    ? history.map((_, i) => i)
    : [0, ...Array.from({ length: 3 }, (_, k) => Math.round((k + 1) * (history.length - 1) / 4)), history.length - 1]
  const xLabels = [...new Set(xIdxs)].map(i => ({
    x:     pts[i].x,
    label: new Date(history[i].recorded_at + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  // ── Stats ─────────────────────────────────────────────────────────────────
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

// ── Card detail modal ────────────────────────────────────────────────────────
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 400, backdropFilter: 'blur(4px)' }} />
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
              ? <img src={listing.img_url} alt={listing.name} style={{ width: 'min(180px, 38vw)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,.6)', display: 'block' }} />
              : <div style={{ width: 'min(180px, 38vw)', aspectRatio: '63/88', background: 'var(--bg-card)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🃏</div>
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
                <span style={{ fontSize: '.62rem', fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#c084fc)', color: '#fff', borderRadius: 4, padding: '2px 7px' }}>✦ FOIL</span>
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
                  background: inCart ? 'rgba(201,168,76,.15)' : 'var(--accent-gold)',
                  color: inCart ? 'var(--accent-gold)' : '#000',
                  fontWeight: 800, fontSize: '.88rem', transition: 'all .15s',
                }}
              >{inCart ? '✓ In Cart' : '+ Add to Cart'}</button>
            </div>
          </div>
        </div>

        {/* ── Price History chart ── */}
        {listing.scryfall_id && (
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{
              fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.6px', color: 'var(--text-muted)', marginBottom: 10,
            }}>📈 Price History</div>
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

// ── Listing card ──────────────────────────────────────────────────────────────
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
          : <div style={{ width: '100%', aspectRatio: '63/88', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🃏</div>
        }
        {listing.is_foil && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'linear-gradient(135deg,#a78bfa,#c084fc)',
            color: '#fff', borderRadius: '4px', padding: '2px 6px',
            fontSize: '.6rem', fontWeight: 800, letterSpacing: '.3px',
          }}>✦ FOIL</div>
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
              background: inCart ? 'rgba(201,168,76,.2)' : 'var(--accent-gold)',
              color: inCart ? 'var(--accent-gold)' : '#000',
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

// ── Cart drawer ───────────────────────────────────────────────────────────────
function CartDrawer({ cart, onClose, onRemove, onQtyChange, onCheckout }) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const total    = subtotal + SHIPPING_COST

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          zIndex: 200, backdropFilter: 'blur(2px)',
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
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>🛒 Cart ({cart.length})</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🛒</div>
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
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{item.condition}{item.is_foil ? ' · ✦' : ''}</div>
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
              <span>Shipping</span><span>{fmt(SHIPPING_COST)}</span>
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

// ── Checkout: payment form (inner — needs Stripe context) ─────────────────────
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

// ── Checkout modal ─────────────────────────────────────────────────────────────
function CheckoutModal({ cart, onClose, onSuccess }) {
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 300, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(480px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 301, padding: '24px 24px 28px',
        boxShadow: '0 24px 60px rgba(0,0,0,.5)',
      }}>

        {/* ── Success ── */}
        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
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

        {/* ── Shipping form ── */}
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
                <span>Shipping</span><span>{fmt(SHIPPING_COST)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '.9rem', marginTop: 4 }}>
                <span>Total</span>
                <span style={{ color: 'var(--accent-gold)' }}>{fmt(subtotal + SHIPPING_COST)}</span>
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
                background: creatingPI ? 'rgba(201,168,76,.5)' : 'var(--accent-gold)',
                color: '#000', fontWeight: 800, fontSize: '.9rem',
                cursor: creatingPI ? 'not-allowed' : 'pointer',
              }}>
                {creatingPI ? 'Preparing…' : 'Continue to Payment →'}
              </button>
            </form>
          </>
        )}

        {/* ── Payment step ── */}
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
                    colorPrimary: '#c9a84c',
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

// ── Main Store page ──────────────────────────────────────────────────────────
export default function Store({ initialSearch = '', onSearchUsed }) {
  const [listings,        setListings]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [search,          setSearch]          = useState(initialSearch)

  // When a card is clicked from the deck builder, pre-populate the search
  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch)
      onSearchUsed?.()
    }
  }, [initialSearch]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sortBy,          setSortBy]          = useState('name')
  const [cart,            setCart]            = useState(loadCart)
  const [cartOpen,        setCartOpen]        = useState(false)
  const [checkoutOpen,    setCheckoutOpen]    = useState(false)
  const [selectedListing, setSelectedListing] = useState(null)

  // Fetch active listings from Supabase (public — no auth required)
  useEffect(() => {
    supabase
      .from('store_listings')
      .select('*')
      .eq('active', true)
      .gt('qty_available', 0)
      .order('name')
      .then(({ data }) => {
        setListings(data || [])
        setLoading(false)
      })
  }, [])

  // Persist cart to localStorage
  useEffect(() => { saveCart(cart) }, [cart])

  const cartIds = useMemo(() => new Set(cart.map(i => i.id)), [cart])

  const filtered = useMemo(() => {
    let list = listings.filter(l =>
      !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.set_name?.toLowerCase().includes(search.toLowerCase())
    )
    if (sortBy === 'price_asc')  list = [...list].sort((a, b) => a.price - b.price)
    if (sortBy === 'price_desc') list = [...list].sort((a, b) => b.price - a.price)
    if (sortBy === 'name')       list = [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'newest')     list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    return list
  }, [listings, search, sortBy])

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
    <div style={{ paddingBottom: cartCount > 0 ? 100 : 80 }}>
      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg,#0f172a 0%,#1a1200 100%)',
        borderRadius: 14, padding: '18px 20px', marginBottom: 20,
        border: '1px solid rgba(201,168,76,.2)',
        boxShadow: '0 4px 20px rgba(201,168,76,.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: '.15em', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 4 }}>
            Vaulted Singles
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-.5px' }}>
            🏪 Card Shop
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {loading ? 'Loading…' : `${listings.length} card${listings.length !== 1 ? 's' : ''} available`}
          </div>
        </div>
        <button
          onClick={() => setCartOpen(true)}
          style={{
            position: 'relative', padding: '10px 16px', borderRadius: 12,
            border: '1px solid var(--accent-gold)', background: cartCount > 0 ? 'rgba(201,168,76,.15)' : 'transparent',
            color: 'var(--accent-gold)', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer',
          }}
        >
          🛒 Cart
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

      {/* ── Search + Sort ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search cards…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 180, padding: '9px 14px', fontSize: '.85rem' }}
        />
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
      </div>

      {/* ── Empty / loading states ── */}
      {loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ aspectRatio: '63/120', borderRadius: 14, background: 'var(--bg-card)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏪</div>
          <p>No cards listed yet.<br />Check back soon!</p>
        </div>
      )}

      {!loading && listings.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>No cards match "{search}"</p>
          <button className="btn btn-ghost" onClick={() => setSearch('')} style={{ marginTop: 12 }}>Clear search</button>
        </div>
      )}

      {/* ── Card grid ── */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
          {filtered.map(listing => (
            <ListingCard
              key={listing.id}
              listing={listing}
              inCart={cartIds.has(listing.id)}
              onAdd={addToCart}
              onView={setSelectedListing}
            />
          ))}
        </div>
      )}

      {/* ── Cart drawer ── */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          onClose={() => setCartOpen(false)}
          onRemove={removeFromCart}
          onQtyChange={changeQty}
          onCheckout={() => { setCartOpen(false); setCheckoutOpen(true) }}
        />
      )}

      {/* ── Checkout modal ── */}
      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={() => setCart([])}
        />
      )}

      {/* ── Card detail modal ── */}
      {selectedListing && (
        <CardDetailModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onAdd={addToCart}
          inCart={cartIds.has(selectedListing.id)}
        />
      )}

      {/* ── Floating cart bar ── */}
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
            background: 'rgba(15,12,5,.92)', backdropFilter: 'blur(16px)',
            border: '1px solid rgba(201,168,76,.45)',
            borderRadius: 16, padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(201,168,76,.15)',
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
                boxShadow: '0 2px 12px rgba(201,168,76,.35)',
              }}
            >
              🛒 View Cart →
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
