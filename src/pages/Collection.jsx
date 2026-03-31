import { useState } from 'react'
import { removeCard, exportData } from '../lib/db'
import { isEbayConnected, connectEbay, listCardOnEbay } from '../lib/ebay'
import { bulkRefreshPrices, suggestPrice } from '../lib/pricing'
import SetTracker from '../components/SetTracker'

const COLOR_TABS      = ['all', 'W', 'U', 'B', 'R', 'G']
const COLOR_LABELS    = { W: '☀️ White', U: '💧 Blue', B: '💀 Black', R: '🔥 Red', G: '🌿 Green' }
const CONDITION_SORT  = { NM: 0, LP: 1, MP: 2, HP: 3 }

export default function Collection({ collection, setCollection, user, openAddCard, openCamera, showToast }) {
  const [view,        setView]        = useState('all')      // 'all' | 'sell' | 'sets' | 'trade'
  const [filter,      setFilter]      = useState('all')
  const [search,      setSearch]      = useState('')
  const [listingId,   setListingId]   = useState(null)
  const [refreshing,  setRefreshing]  = useState(false)
  const [refreshProg, setRefreshProg] = useState(null)       // { done, total }
  const [tradeSelect, setTradeSelect] = useState(new Set())  // card ids selected for trade calc

  const ebayConnected = isEbayConnected()

  // ── helpers ──────────────────────────────────────────────────────────────

  function updateCard(id, patch) {
    const next = collection.map(c => c.id === id ? { ...c, ...patch } : c)
    setCollection(next)
    const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
    stored.collection = next
    localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
  }

  async function handleRemove(id) {
    await removeCard(id, user?.id)
    setCollection(collection.filter(c => c.id !== id))
    showToast('Card removed')
  }

  function handleExport() {
    const csv = 'Name,Quantity,Condition,Set,For Sale,Sale Price\n' +
      collection.map(c =>
        `"${c.name}",${c.qty},${c.condition || ''},"${c.setName || ''}",${c.forSale ? 'Yes' : 'No'},${c.salePrice || ''}`
      ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'collection.csv'
    a.click()
    showToast('Exported to CSV')
  }

  function handleBackup() {
    exportData([], collection)
    showToast('Backup created')
  }

  async function handleList(card) {
    setListingId(card.id)
    await listCardOnEbay(card, showToast)
    setListingId(null)
  }

  // ── Bulk price refresh ────────────────────────────────────────────────────
  async function handleBulkRefresh() {
    if (refreshing || collection.length === 0) return
    setRefreshing(true)
    setRefreshProg({ done: 0, total: collection.length })
    const updates = await bulkRefreshPrices(collection, {
      onProgress: (done, total) => setRefreshProg({ done, total }),
    })
    if (updates.length > 0) {
      setCollection(collection.map(c => {
        const u = updates.find(x => x.id === c.id)
        return u ? { ...c, price: u.price } : c
      }))
      // Persist to localStorage
      const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
      stored.collection = collection.map(c => {
        const u = updates.find(x => x.id === c.id)
        return u ? { ...c, price: u.price } : c
      })
      localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
      showToast(`Updated prices for ${updates.length} card${updates.length !== 1 ? 's' : ''} ✓`)
    } else {
      showToast('No price updates found')
    }
    setRefreshing(false)
    setRefreshProg(null)
  }

  // ── Trade calculator ──────────────────────────────────────────────────────
  function toggleTradeSelect(id) {
    setTradeSelect(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const tradeCards     = collection.filter(c => tradeSelect.has(c.id))
  const tradeValue     = tradeCards.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
  const tradeActive    = view === 'trade'

  function copyTradeList() {
    const text = tradeCards.map(c =>
      `${c.qty}x ${c.name} (${c.setName || '?'}) — $${(parseFloat(c.price) || 0).toFixed(2)}`
    ).join('\n') + `\n\nTotal: $${tradeValue.toFixed(2)}`
    navigator.clipboard.writeText(text).then(
      () => showToast('Trade list copied ✓'),
      () => showToast('Copy failed')
    )
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const base     = view === 'sell' ? collection.filter(c => c.forSale) : collection
  const byColor  = filter === 'all' ? base : base.filter(c => (c.colors || []).includes(filter))
  const filtered = search
    ? byColor.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : byColor

  const total        = collection.reduce((s, c) => s + (c.qty || 1), 0)
  const totalValue   = collection.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
  const forSaleCount = collection.filter(c => c.forSale).length

  return (
    <div>
      {/* ── Top controls ── */}
      <div className="collection-controls">
        <input
          type="text"
          className="form-input"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '200px' }}
        />
        <button className="btn btn-primary" onClick={() => openAddCard()}>+ Add</button>
        <button className="btn btn-ghost"   onClick={() => openCamera()}>📷 Scan</button>
        <button className="btn btn-ghost"   onClick={handleExport} title="Export CSV">⬇️</button>
        <button className="btn btn-ghost"   onClick={handleBackup} title="Backup JSON">💾</button>
        <button
          className="btn btn-ghost"
          onClick={handleBulkRefresh}
          disabled={refreshing}
          title="Re-fetch prices from Scryfall for all cards"
          style={{ fontSize: '.78rem' }}
        >
          {refreshing ? `${refreshProg?.done || 0}/${refreshProg?.total || '?'}` : '🔄 Refresh Prices'}
        </button>

        <span style={{ marginLeft: 'auto', fontSize: '.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {total} cards
          {totalValue > 0 && (
            <span style={{ color: 'var(--accent-gold)', marginLeft: '8px' }}>
              ${totalValue.toFixed(2)}
            </span>
          )}
          {forSaleCount > 0 && (
            <span style={{ color: 'var(--accent-teal)', marginLeft: '8px' }}>· {forSaleCount} for sale</span>
          )}
        </span>
      </div>

      {/* Refresh progress bar */}
      {refreshing && refreshProg && (
        <div style={{ height: '4px', background: 'var(--bg-hover)', borderRadius: '99px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--accent-teal)', borderRadius: '99px',
            width: `${(refreshProg.done / refreshProg.total) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>
      )}

      {/* ── View tabs ── */}
      <div className="tabs" style={{ marginBottom: '0' }}>
        {[
          ['all',   `All (${collection.length})`],
          ['sell',  `🏷️ Sell ${forSaleCount > 0 ? `(${forSaleCount})` : ''}`],
          ['trade', '⚖️ Trade Calc'],
          ['sets',  '🗺️ Set Tracker'],
        ].map(([id, label]) => (
          <button key={id} className={`tab ${view === id ? 'active' : ''}`} onClick={() => setView(id)}>
            {label}
          </button>
        ))}

        {/* eBay status */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}>
          {ebayConnected
            ? <span style={{ fontSize: '.72rem', color: 'var(--accent-green)', fontWeight: 600 }}>✓ eBay</span>
            : <button className="btn btn-ghost btn-sm" onClick={connectEbay} style={{ fontSize: '.68rem' }}>🔗 Connect eBay</button>
          }
        </div>
      </div>

      {/* ── Set Tracker ── */}
      {view === 'sets' && (
        <div style={{ marginTop: '20px' }}>
          <SetTracker collection={collection} />
        </div>
      )}

      {/* ── Trade Calculator ── */}
      {view === 'trade' && (
        <div style={{ marginTop: '16px' }}>
          {/* Sticky trade total bar */}
          {tradeSelect.size > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
              display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Trade Value</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                  ${tradeValue.toFixed(2)}
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                  {tradeSelect.size} card{tradeSelect.size !== 1 ? 's' : ''} selected
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={copyTradeList}>📋 Copy List</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setTradeSelect(new Set())}>Clear</button>
              </div>
            </div>
          )}

          {collection.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">⚖️</div><p>Add cards to use the trade calculator.</p></div>
          ) : (
            <>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Tap cards to add them to your trade pile. The running total updates in real time.
              </div>
              <div className="collection-grid">
                {collection.map(card => {
                  const sel = tradeSelect.has(card.id)
                  return (
                    <div
                      key={card.id}
                      onClick={() => toggleTradeSelect(card.id)}
                      style={{
                        background: sel ? 'rgba(201,168,76,.12)' : 'var(--bg-card)',
                        border: `2px solid ${sel ? 'var(--accent-gold)' : 'var(--border)'}`,
                        borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
                        transition: 'all .15s', transform: sel ? 'translateY(-2px)' : 'none',
                        boxShadow: sel ? '0 4px 16px rgba(201,168,76,.2)' : 'none',
                      }}
                    >
                      {card.img && <img src={card.img} alt={card.name} style={{ width: '100%', display: 'block' }} />}
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: '.74rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.name}</div>
                        {card.price != null && (
                          <div style={{ fontSize: '.68rem', color: 'var(--accent-gold)', fontWeight: 700 }}>
                            ${parseFloat(card.price).toFixed(2)}
                          </div>
                        )}
                      </div>
                      {sel && (
                        <div style={{
                          position: 'absolute', top: '6px', right: '6px',
                          background: 'var(--accent-gold)', borderRadius: '50%',
                          width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '.7rem', fontWeight: 800, color: '#1a1000',
                        }}>✓</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Color filter (All view only) ── */}
      {(view === 'all' || view === 'sell') && (
        <div className="tabs" style={{ borderTop: 'none', marginBottom: '16px' }}>
          {COLOR_TABS.map(f => (
            <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All Colors' : COLOR_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty states ── */}
      {(view === 'all' || view === 'sell') && filtered.length === 0 && view === 'all' && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">💎</div>
          <p>Collection is empty.<br />Add cards manually or scan them!</p>
          <button className="btn btn-primary" onClick={() => openAddCard()} style={{ marginTop: '16px' }}>+ Add Card</button>
        </div>
      )}

      {view === 'sell' && filtered.length === 0 && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">🏷️</div>
          <p>No cards marked for sale yet.<br />Tap the 🏷️ on any card to add it here.</p>
          <button className="btn btn-ghost" onClick={() => setView('all')} style={{ marginTop: '16px' }}>← Back to Collection</button>
        </div>
      )}

      {/* ── All Cards grid ── */}
      {view === 'all' && filtered.length > 0 && (
        <div className="collection-grid">
          {filtered.map(card => (
            <div key={card.id} className={`col-card ${card.forSale ? 'for-sale' : ''}`}>
              {card.img && <img src={card.img} alt={card.name} />}
              <div className="col-card-info">
                <div className="col-card-name">{card.name}</div>
                <div className="col-card-set">{card.setName}</div>
                {card.price != null && (
                  <div style={{ fontSize: '.66rem', color: 'var(--accent-gold)', fontWeight: 700, marginTop: '2px' }}>
                    ${parseFloat(card.price).toFixed(2)}
                  </div>
                )}
                {card.condition && (
                  <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>{card.condition}</div>
                )}
              </div>
              <span className="col-card-qty">×{card.qty}</span>

              {/* For Sale toggle */}
              <button
                className="col-card-tag-btn"
                title={card.forSale ? 'Remove from sell list' : 'Mark for sale'}
                onClick={() => updateCard(card.id, { forSale: !card.forSale })}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '.9rem', padding: '2px 4px', lineHeight: 1,
                  color: card.forSale ? 'var(--accent-gold)' : 'var(--text-muted)',
                  opacity: card.forSale ? 1 : 0.4,
                  transition: 'opacity .2s, color .2s',
                  position: 'absolute', top: '6px', left: '6px',
                }}
              >
                🏷️
              </button>

              <button className="col-card-remove" onClick={() => handleRemove(card.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Sell List ── */}
      {view === 'sell' && filtered.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 14px',
            display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '.76rem', color: 'var(--text-muted)',
          }}>
            <span>🏪 <strong style={{ color: 'var(--text-secondary)' }}>TCGPlayer</strong> — opens the product page to list manually</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span>📦 <strong style={{ color: 'var(--text-secondary)' }}>eBay Auto-List</strong> — creates a draft listing via API</span>
            {!ebayConnected && (
              <button className="btn btn-primary btn-sm" onClick={connectEbay} style={{ fontSize: '.68rem', marginLeft: 'auto' }}>
                🔗 Connect eBay
              </button>
            )}
          </div>

          {filtered.map(card => (
            <SellCard
              key={card.id}
              card={card}
              ebayConnected={ebayConnected}
              listing={listingId === card.id}
              onUpdatePrice={p  => updateCard(card.id, { salePrice: p })}
              onUpdateQty={q    => updateCard(card.id, { sellQty: q })}
              onRemoveFromSell={() => updateCard(card.id, { forSale: false })}
              onList={() => handleList({ ...card })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sell List row ─────────────────────────────────────────────────────────────

function SellCard({ card, ebayConnected, listing, onUpdatePrice, onUpdateQty, onRemoveFromSell, onList }) {
  const tcgUrl = card.tcgplayerUrl ||
    `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`

  const suggested = suggestPrice(parseFloat(card.price) || 0)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '12px 14px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: '10px',
    }}>
      {/* Card image */}
      {card.img
        ? <img src={card.img} alt={card.name} style={{ width: '42px', borderRadius: '4px', flexShrink: 0 }} />
        : <div style={{ width: '42px', height: '60px', background: 'var(--bg-secondary)', borderRadius: '4px', flexShrink: 0 }} />
      }

      {/* Card info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.86rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.name}</div>
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {card.setName} · <span style={{ color: 'var(--text-secondary)' }}>{card.condition || 'NM'}</span>
          {card.isFoil && <span style={{ color: 'var(--accent-purple)', marginLeft: '4px' }}>✦ Foil</span>}
        </div>
        {card.price != null && (
          <div style={{ fontSize: '.7rem', color: 'var(--accent-gold)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span>Market: ${parseFloat(card.price).toFixed(2)}</span>
            {suggested != null && (
              <span style={{ color: 'var(--accent-teal)' }}>Suggested: ${suggested.toFixed(2)}</span>
            )}
          </div>
        )}
      </div>

      {/* Price + Qty */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <label style={{ display: 'block', fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '3px' }}>Price</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>$</span>
            <input
              type="number" className="form-input"
              min="0.01" step="0.01"
              placeholder={suggested?.toFixed(2) || card.price?.toFixed?.(2) || '0.99'}
              defaultValue={card.salePrice || ''}
              onBlur={e => onUpdatePrice(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '.78rem', width: '64px' }}
            />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '3px' }}>Qty</label>
          <input
            type="number" className="form-input"
            min="1" max={card.qty}
            defaultValue={card.sellQty || 1}
            onBlur={e => onUpdateQty(parseInt(e.target.value, 10) || 1)}
            style={{ padding: '4px 6px', fontSize: '.78rem', width: '48px' }}
          />
        </div>
      </div>

      {/* Platform buttons + remove */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
        <a
          href={tcgUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '.68rem', textAlign: 'center', textDecoration: 'none', display: 'block' }}
        >
          🏪 TCGPlayer →
        </a>
        <button
          className="btn btn-primary btn-sm"
          onClick={onList}
          disabled={!ebayConnected || listing}
          style={{ fontSize: '.68rem' }}
        >
          {listing ? '⏳…' : '📦 eBay'}
        </button>
        {!ebayConnected && (
          <button className="btn btn-ghost btn-sm" onClick={connectEbay} style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>
            Connect eBay
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onRemoveFromSell}
          style={{ fontSize: '.72rem', padding: '4px 8px' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
