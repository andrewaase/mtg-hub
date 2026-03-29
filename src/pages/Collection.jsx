import { useState } from 'react'
import { removeCard, exportData } from '../lib/db'
import { isEbayConnected, connectEbay, listCardOnEbay } from '../lib/ebay'

const COLOR_TABS = ['all', 'W', 'U', 'B', 'R', 'G']
const COLOR_LABELS = { W: '☀️ White', U: '💧 Blue', B: '💀 Black', R: '🔥 Red', G: '🌿 Green' }
const CONDITION_SORT = { NM: 0, LP: 1, MP: 2, HP: 3 }

export default function Collection({ collection, setCollection, user, openAddCard, openCamera, showToast }) {
  const [view, setView]       = useState('all')     // 'all' | 'sell'
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [listingId, setListingId] = useState(null)  // card id currently being listed

  const ebayConnected = isEbayConnected()

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateCard = (id, patch) => {
    setCollection(collection.map(c => c.id === id ? { ...c, ...patch } : c))
    // Persist locally (Supabase users will re-sync on reload; good enough for now)
    const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
    stored.collection = (stored.collection || []).map(c => c.id === id ? { ...c, ...patch } : c)
    localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
  }

  const handleRemove = async (id) => {
    await removeCard(id, user?.id)
    setCollection(collection.filter(c => c.id !== id))
    showToast('Card removed')
  }

  const handleExport = () => {
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

  const handleBackup = () => {
    exportData([], collection)
    showToast('Backup created')
  }

  const handleList = async (card) => {
    setListingId(card.id)
    await listCardOnEbay(card, showToast)
    setListingId(null)
  }

  // ── filtering ─────────────────────────────────────────────────────────────

  const base = view === 'sell'
    ? collection.filter(c => c.forSale)
    : collection

  const byColor = filter === 'all' ? base : base.filter(c => (c.colors || []).includes(filter))
  const filtered = search
    ? byColor.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : byColor

  const total       = collection.reduce((s, c) => s + (c.qty || 1), 0)
  const forSaleCount = collection.filter(c => c.forSale).length

  return (
    <div>
      {/* ── Top controls ── */}
      <div className="collection-controls">
        <input
          type="text"
          className="form-input"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: '220px' }}
        />
        <button className="btn btn-primary" onClick={() => openAddCard()}>+ Add Card</button>
        <button className="btn btn-ghost"   onClick={() => openCamera()}>📷 Scan</button>
        <button className="btn btn-ghost"   onClick={handleExport}>⬇️ CSV</button>
        <button className="btn btn-ghost"   onClick={handleBackup}>💾 Backup</button>
        <span style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--text-muted)' }}>
          {total} cards
          {forSaleCount > 0 && <span style={{ color: 'var(--accent-gold)', marginLeft: '8px' }}>• {forSaleCount} for sale</span>}
        </span>
      </div>

      {/* ── View toggle: All / Sell List ── */}
      <div className="tabs" style={{ marginBottom: '0' }}>
        <button className={`tab ${view === 'all'  ? 'active' : ''}`} onClick={() => setView('all')}>
          All Cards
        </button>
        <button className={`tab ${view === 'sell' ? 'active' : ''}`} onClick={() => setView('sell')}>
          🏷️ Sell List {forSaleCount > 0 && `(${forSaleCount})`}
        </button>

        {/* eBay connection status sits on the right side of the tab bar */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}>
          {ebayConnected ? (
            <span style={{ fontSize: '.75rem', color: '#4caf50', fontWeight: 600 }}>✓ eBay connected</span>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={connectEbay} style={{ fontSize: '.72rem' }}>
              🔗 Connect eBay
            </button>
          )}
        </div>
      </div>

      {/* ── Color filter tabs (only shown in All view) ── */}
      {view === 'all' && (
        <div className="tabs" style={{ borderTop: 'none', marginBottom: '20px' }}>
          {COLOR_TABS.map(f => (
            <button
              key={f}
              className={`tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All Colors' : COLOR_LABELS[f]}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty states ── */}
      {filtered.length === 0 && view === 'all' && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">📦</div>
          <p>Collection is empty.<br />Add cards manually or scan them!</p>
          <button className="btn btn-primary" onClick={() => openAddCard()} style={{ marginTop: '16px' }}>
            + Add Card
          </button>
        </div>
      )}

      {filtered.length === 0 && view === 'sell' && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">🏷️</div>
          <p>No cards marked for sale yet.<br />Toggle the tag icon on any card to add it here.</p>
          <button className="btn btn-ghost" onClick={() => setView('all')} style={{ marginTop: '16px' }}>
            ← Back to Collection
          </button>
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
                {card.condition && (
                  <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>{card.condition}</div>
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
                  fontSize: '1rem', padding: '2px 4px', lineHeight: 1,
                  color: card.forSale ? 'var(--accent-gold)' : 'var(--text-muted)',
                  opacity: card.forSale ? 1 : 0.4,
                  transition: 'opacity .2s, color .2s',
                  position: 'absolute', top: '6px', left: '6px'
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
        <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
          {/* Platform info banner */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 16px',
            display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center',
            fontSize: '.78rem', color: 'var(--text-muted)'
          }}>
            <span>🏪 <strong style={{ color: 'var(--text-secondary)' }}>TCGPlayer</strong> — opens the product page so you can list manually</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span>📦 <strong style={{ color: 'var(--text-secondary)' }}>eBay Auto-List</strong> — creates a draft listing via API instantly</span>
            {!ebayConnected && (
              <>
                <span style={{ color: 'var(--border)' }}>|</span>
                <button className="btn btn-primary btn-sm" onClick={connectEbay} style={{ fontSize: '.72rem' }}>
                  🔗 Connect eBay to enable
                </button>
              </>
            )}
          </div>

          {filtered.map(card => (
            <SellCard
              key={card.id}
              card={card}
              ebayConnected={ebayConnected}
              listing={listingId === card.id}
              onUpdatePrice={(price) => updateCard(card.id, { salePrice: price })}
              onUpdateQty={(qty)   => updateCard(card.id, { sellQty: qty })}
              onRemoveFromSell={()  => updateCard(card.id, { forSale: false })}
              onList={() => handleList({ ...card })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sell List row component ────────────────────────────────────────────────

function SellCard({ card, ebayConnected, listing, onUpdatePrice, onUpdateQty, onRemoveFromSell, onList }) {
  // Build the best TCGPlayer URL we have:
  // 1. Saved from Scryfall at add-time (direct product page)
  // 2. Fallback: TCGPlayer search for the card name
  const tcgUrl = card.tcgplayerUrl ||
    `https://www.tcgplayer.com/search/magic/product?q=${encodeURIComponent(card.name)}&view=grid`

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px 16px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto auto',
      alignItems: 'center', gap: '12px'
    }}>
      {/* Card image */}
      {card.img
        ? <img src={card.img} alt={card.name} style={{ width: '44px', borderRadius: '4px', flexShrink: 0 }} />
        : <div style={{ width: '44px', height: '62px', background: 'var(--bg-secondary)', borderRadius: '4px', flexShrink: 0 }} />
      }

      {/* Card info */}
      <div style={{ minWidth: '120px' }}>
        <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.name}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
          {card.setName} · <span style={{ color: 'var(--text-secondary)' }}>{card.condition || 'NM'}</span>
        </div>
        {card.price != null && (
          <div style={{ fontSize: '.72rem', color: 'var(--accent-gold)', marginTop: '2px' }}>
            Market: ${parseFloat(card.price).toFixed(2)}
          </div>
        )}
      </div>

      {/* Price + Qty inputs */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Price</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>$</span>
            <input
              type="number" className="form-input"
              min="0.01" step="0.01"
              placeholder={card.price ? parseFloat(card.price).toFixed(2) : '0.99'}
              defaultValue={card.salePrice || ''}
              onBlur={e => onUpdatePrice(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '.8rem', width: '68px' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Qty</label>
          <input
            type="number" className="form-input"
            min="1" max={card.qty}
            defaultValue={card.sellQty || 1}
            onBlur={e => onUpdateQty(parseInt(e.target.value, 10) || 1)}
            style={{ padding: '4px 6px', fontSize: '.8rem', width: '52px' }}
          />
        </div>
      </div>

      {/* ── Platform buttons ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>

        {/* TCGPlayer — deep link to product page */}
        <a
          href={tcgUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          title="Open TCGPlayer product page to list manually"
          style={{ fontSize: '.72rem', textAlign: 'center', textDecoration: 'none', display: 'block' }}
        >
          🏪 TCGPlayer →
        </a>

        {/* eBay — API auto-listing */}
        <button
          className="btn btn-primary btn-sm"
          onClick={onList}
          disabled={!ebayConnected || listing}
          title={ebayConnected ? 'Auto-create eBay draft listing via API' : 'Connect eBay account first'}
          style={{ fontSize: '.72rem' }}
        >
          {listing ? '⏳ Listing...' : '📦 eBay Auto-List'}
        </button>

        {!ebayConnected && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={connectEbay}
            style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}
          >
            Connect eBay
          </button>
        )}
      </div>

      {/* Remove from sell list */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={onRemoveFromSell}
        title="Remove from sell list"
        style={{ fontSize: '.8rem', padding: '4px 8px', alignSelf: 'flex-start' }}
      >
        ✕
      </button>
    </div>
  )
}
