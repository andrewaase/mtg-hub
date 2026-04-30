import { useState, useEffect } from 'react'
import { searchScryfall, getCardDetails } from '../lib/utils'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { getCardPriceHistory } from '../lib/priceHistory'
import SparklineChart from '../components/SparklineChart'
import { getWishlist, addWishlistItem, updateWishlistItem, removeWishlistItem } from '../lib/db'

function fmt(n) { return n != null ? `$${parseFloat(n).toFixed(2)}` : '—' }

export default function Wishlist({ user, showToast }) {
  const [items,      setItems]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [cardName,   setCardName]   = useState('')
  const [target,     setTarget]     = useState('')
  const [suggestions, setSugg]      = useState([])
  const [showDrop,   setShowDrop]   = useState(false)
  const [cardData,   setCardData]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  // Load from Supabase (or localStorage for guests)
  useEffect(() => {
    setLoading(true)
    getWishlist(user?.id).then(data => { setItems(data); setLoading(false) })
  }, [user])

  // Autocomplete
  useEffect(() => {
    if (cardName.length < 2) { setSugg([]); return }
    const t = setTimeout(async () => {
      const r = await searchScryfall(cardName)
      setSugg(r.slice(0, 8))
      setShowDrop(true)
    }, 280)
    return () => clearTimeout(t)
  }, [cardName])

  async function selectCard(name) {
    setCardName(name)
    setSugg([])
    setShowDrop(false)
    const data = await getCardDetails(name)
    setCardData(data)
    if (data?.prices?.usd) {
      setTarget(Math.floor(parseFloat(data.prices.usd)).toString())
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!cardName.trim()) return
    const existing = items.find(i => i.name.toLowerCase() === cardName.toLowerCase())
    if (existing) { showToast(`${cardName} is already on your watchlist`); return }
    const item = {
      name:         cardName.trim(),
      targetPrice:  target ? parseFloat(target) : null,
      currentPrice: cardData?.prices?.usd ? parseFloat(cardData.prices.usd) : null,
      img:          cardData?.image_uris?.small || cardData?.card_faces?.[0]?.image_uris?.small || null,
      setName:      cardData?.set_name || null,
      addedAt:      new Date().toISOString(),
    }
    try {
      const saved = await addWishlistItem(item, user?.id)
      setItems(prev => [saved, ...prev])
      showToast(`Added ${cardName} to watchlist`)
      setCardName(''); setTarget(''); setCardData(null)
    } catch (err) {
      showToast('Could not save to wishlist')
      console.error('[Wishlist] add error:', err)
    }
  }

  async function handleRemove(id) {
    setItems(prev => prev.filter(i => i.id !== id)) // optimistic
    try { await removeWishlistItem(id, user?.id) }
    catch (err) { console.error('[Wishlist] remove error:', err) }
  }

  async function handleSetTarget(id, val) {
    const targetPrice = val ? parseFloat(val) : null
    setItems(prev => prev.map(i => i.id === id ? { ...i, targetPrice } : i)) // optimistic
    try { await updateWishlistItem(id, { targetPrice }, user?.id) }
    catch (err) { console.error('[Wishlist] update error:', err) }
  }

  // Refresh current prices from Scryfall
  async function handleRefreshAll() {
    if (refreshing || items.length === 0) return
    setRefreshing(true)
    showToast('Refreshing wishlist prices…')
    const updated = [...items]
    for (let i = 0; i < updated.length; i++) {
      try {
        const data = await getCardDetails(updated[i].name)
        if (data?.prices?.usd) {
          const currentPrice = parseFloat(data.prices.usd)
          updated[i] = { ...updated[i], currentPrice }
          await updateWishlistItem(updated[i].id, { currentPrice }, user?.id)
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 110))
    }
    setItems(updated)
    setRefreshing(false)
    showToast('Prices updated ✓')
  }

  const alerts = items.filter(i =>
    i.targetPrice != null && i.currentPrice != null && i.currentPrice <= i.targetPrice
  )

  return (
    <div>
      {/* Alert banner */}
      {alerts.length > 0 && (
        <div style={{
          background: 'rgba(62,207,178,.1)', border: '1px solid rgba(62,207,178,.3)',
          borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '1.1rem' }}>🎯</span>
          <span style={{ fontWeight: 700, color: 'var(--accent-teal)', fontSize: '.9rem' }}>
            {alerts.length} card{alerts.length > 1 ? 's' : ''} at or below your target price
          </span>
          <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>
            {alerts.map(a => a.name).join(', ')}
          </span>
        </div>
      )}

      {/* Sign-in nudge for guests */}
      {!user && (
        <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '.8rem', color: '#fbbf24' }}>
          ⚠️ Sign in to sync your watchlist across devices — items added as a guest won't carry over.
        </div>
      )}

      {/* Add card form */}
      <div className="card mb-20">
        <div style={{ fontWeight: 700, fontSize: '.68rem', color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.8px' }}>
          Add to Watchlist
        </div>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Card name */}
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
              <label className="form-label">Card Name</label>
              <input
                className="form-input"
                placeholder="Search Scryfall…"
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                autoComplete="off"
              />
              {showDrop && suggestions.length > 0 && (
                <div className="ac-dropdown">
                  {suggestions.map(s => (
                    <div key={s} className="ac-item" onClick={() => selectCard(s)}>
                      <span className="ac-name">{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Target price */}
            <div style={{ flex: '0 1 120px' }}>
              <label className="form-label">Alert Below</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number" className="form-input" placeholder="0.00"
                  min="0" step="0.01" value={target}
                  onChange={e => setTarget(e.target.value)}
                  style={{ paddingLeft: '6px' }}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>
              + Watch
            </button>
          </div>

          {cardData && (
            <div style={{
              marginTop: '10px', padding: '8px 12px',
              background: 'var(--bg-primary)', borderRadius: '8px',
              fontSize: '.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', alignItems: 'center',
            }}>
              {cardData.image_uris?.small && (
                <img src={cardData.image_uris.small} alt="" style={{ width: '32px', borderRadius: '3px' }} />
              )}
              <span>{cardData.name}</span>
              {cardData.set_name && <span style={{ color: 'var(--text-muted)' }}>{cardData.set_name}</span>}
              {cardData.prices?.usd && (
                <span style={{ color: 'var(--accent-gold)', fontWeight: 700, marginLeft: 'auto' }}>
                  Market: ${parseFloat(cardData.prices.usd).toFixed(2)}
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Header row */}
      {items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
            {items.length} card{items.length !== 1 ? 's' : ''} watched
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRefreshAll}
            disabled={refreshing}
            style={{ fontSize: '.72rem' }}
          >
            {refreshing ? '⏳ Refreshing…' : '🔄 Refresh Prices'}
          </button>
        </div>
      )}

      {/* Watchlist */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <p>No cards on your watchlist yet.<br />Add cards you want to buy at a target price.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(item => (
            <WishlistItem key={item.id} item={item} onRemove={handleRemove} onSetTarget={handleSetTarget} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single wishlist item ───────────────────────────────────────────────────────

function WishlistItem({ item, onRemove, onSetTarget }) {
  const [editTarget, setEditTarget] = useState(false)
  const [targetVal,  setTargetVal]  = useState(item.targetPrice?.toFixed(2) || '')

  const atTarget  = item.targetPrice != null && item.currentPrice != null && item.currentPrice <= item.targetPrice
  const hasPrice  = item.currentPrice != null
  const delta     = hasPrice && item.targetPrice != null
    ? ((item.currentPrice - item.targetPrice) / item.targetPrice) * 100
    : null

  const priceHist  = getCardPriceHistory(item.name)
  const sparkData  = priceHist.map(e => e.price)
  const sparkLabels = priceHist.map(e => e.date.slice(5))

  return (
    <div style={{
      background: atTarget ? 'rgba(62,207,178,.06)' : 'var(--bg-card)',
      border: `1px solid ${atTarget ? 'rgba(62,207,178,.4)' : 'var(--border)'}`,
      borderRadius: '14px', padding: '14px 16px', transition: 'border-color .2s',
    }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {item.img
          ? <img src={item.img} alt={item.name} style={{ width: '48px', borderRadius: '6px', flexShrink: 0 }} />
          : <div style={{ width: '48px', height: '68px', background: 'var(--bg-hover)', borderRadius: '6px', flexShrink: 0 }} />
        }

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '.92rem', color: 'var(--text-primary)' }}>{item.name}</div>
              {item.setName && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '1px' }}>{item.setName}</div>}
            </div>
            <button
              onClick={() => onRemove(item.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '.8rem', padding: '0', flexShrink: 0 }}
            >✕</button>
          </div>

          {/* Prices */}
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
            {hasPrice && (
              <div>
                <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>Market</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: atTarget ? 'var(--accent-teal)' : 'var(--text-primary)' }}>
                  {fmt(item.currentPrice)}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>Target</div>
              {editTarget ? (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>$</span>
                  <input
                    type="number" className="form-input" value={targetVal}
                    autoFocus min="0" step="0.01"
                    onChange={e => setTargetVal(e.target.value)}
                    onBlur={() => { onSetTarget(item.id, targetVal); setEditTarget(false) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onSetTarget(item.id, targetVal); setEditTarget(false) }
                      if (e.key === 'Escape') setEditTarget(false)
                    }}
                    style={{ width: '72px', padding: '3px 6px', fontSize: '.82rem' }}
                  />
                </div>
              ) : (
                <div
                  onClick={() => setEditTarget(true)}
                  style={{
                    fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
                    color: atTarget ? 'var(--accent-teal)' : item.targetPrice ? 'var(--accent-gold)' : 'var(--text-muted)',
                    borderBottom: '1px dashed var(--border)', display: 'inline-block',
                  }}
                >
                  {item.targetPrice != null ? fmt(item.targetPrice) : 'Set target'}
                </div>
              )}
            </div>

            {atTarget && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'rgba(62,207,178,.15)', borderRadius: '99px',
                padding: '3px 10px', fontSize: '.7rem', fontWeight: 700, color: 'var(--accent-teal)',
              }}>🎯 At target!</div>
            )}

            {!atTarget && delta != null && (
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                {delta > 0 ? '+' : ''}{delta.toFixed(0)}% from target
              </div>
            )}
          </div>

          {sparkData.length >= 2 && (
            <div style={{ marginTop: '10px', height: '40px' }}>
              <SparklineChart data={sparkData} labels={sparkLabels} height={40} color={atTarget ? '#3ecfb2' : '#c9a84c'} showArea showDot />
            </div>
          )}

          <a
            href={getTCGPlayerLink(item.tcgUrl || item.name)}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-block', marginTop: '10px', padding: '6px 14px',
              background: 'rgba(74,222,128,.10)', color: '#4ade80',
              border: '1px solid rgba(74,222,128,.25)', borderRadius: '8px',
              fontSize: '.75rem', fontWeight: 700, textDecoration: 'none',
            }}
          >
            🛒 Buy on TCGPlayer
          </a>
        </div>
      </div>
    </div>
  )
}
