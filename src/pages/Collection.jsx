import { useState, useMemo, useEffect } from 'react'
import { removeCard, exportData } from '../lib/db'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { isEbayConnected, connectEbay, listCardOnEbay } from '../lib/ebay'
import { bulkRefreshPrices, suggestPrice } from '../lib/pricing'
import SetTracker from '../components/SetTracker'
import { getCKPriceMap, getCKBuyPrice, getSellSignal } from '../lib/cardkingdom'

const COLOR_OPTIONS = [
  { id: 'W', label: '☀️ White' },
  { id: 'U', label: '💧 Blue' },
  { id: 'B', label: '💀 Black' },
  { id: 'R', label: '🔥 Red' },
  { id: 'G', label: '🌿 Green' },
  { id: 'C', label: '⬡ Colorless' },
]
const RARITY_OPTIONS    = ['common', 'uncommon', 'rare', 'mythic']
const CONDITION_OPTIONS = ['NM', 'LP', 'MP', 'HP']

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
              padding: '5px 12px',
              borderRadius: '99px',
              border: `1.5px solid ${isActive(id) ? 'var(--accent-teal)' : 'var(--border)'}`,
              background: isActive(id) ? 'rgba(245,158,11,.15)' : 'var(--bg-secondary)',
              color: isActive(id) ? 'var(--accent-teal)' : 'var(--text-secondary)',
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

export default function Collection({ collection, setCollection, user, openAddCard, openCamera, showToast }) {
  const [view,         setView]         = useState('all')
  const [search,       setSearch]       = useState('')
  const [showFilters,  setShowFilters]  = useState(false)
  const [listingId,    setListingId]    = useState(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [refreshProg,  setRefreshProg]  = useState(null)
  const [tradeSelect,  setTradeSelect]  = useState(new Set())
  const [ckMap,        setCkMap]        = useState({})

  // ── Filter state ──
  const [filterColors,    setFilterColors]    = useState([])
  const [filterRarity,    setFilterRarity]    = useState(null)
  const [filterCondition, setFilterCondition] = useState(null)
  const [filterFoil,      setFilterFoil]      = useState(null)   // 'foil' | 'nonfoil' | null
  const [filterMinPrice,  setFilterMinPrice]  = useState('')
  const [filterMaxPrice,  setFilterMaxPrice]  = useState('')

  // Load CK prices in background on mount
  useEffect(() => {
    getCKPriceMap().then(setCkMap).catch(() => {})
  }, [])

  const ebayConnected = isEbayConnected()

  const activeFilterCount = [
    filterColors.length > 0,
    filterRarity != null,
    filterCondition != null,
    filterFoil != null,
    filterMinPrice !== '',
    filterMaxPrice !== '',
  ].filter(Boolean).length

  function clearFilters() {
    setFilterColors([])
    setFilterRarity(null)
    setFilterCondition(null)
    setFilterFoil(null)
    setFilterMinPrice('')
    setFilterMaxPrice('')
  }

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
    const csv = 'Name,Quantity,Condition,Set,Foil,For Sale,Sale Price\n' +
      collection.map(c =>
        `"${c.name}",${c.qty},${c.condition || ''},"${c.setName || ''}",${c.isFoil ? 'Yes' : 'No'},${c.forSale ? 'Yes' : 'No'},${c.salePrice || ''}`
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

  async function handleBulkRefresh() {
    if (refreshing || collection.length === 0) return
    setRefreshing(true)
    setRefreshProg({ done: 0, total: collection.length })
    const updates = await bulkRefreshPrices(collection, {
      onProgress: (done, total) => setRefreshProg({ done, total }),
    })
    if (updates.length > 0) {
      const next = collection.map(c => {
        const u = updates.find(x => x.id === c.id)
        return u ? { ...c, price: u.price } : c
      })
      setCollection(next)
      const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
      stored.collection = next
      localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
      showToast(`Updated prices for ${updates.length} card${updates.length !== 1 ? 's' : ''} ✓`)
    } else {
      showToast('No price updates found')
    }
    setRefreshing(false)
    setRefreshProg(null)
  }

  // ── Trade ─────────────────────────────────────────────────────────────────
  function toggleTradeSelect(id) {
    setTradeSelect(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const tradeCards  = collection.filter(c => tradeSelect.has(c.id))
  const tradeValue  = tradeCards.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)

  function copyTradeList() {
    const text = tradeCards.map(c =>
      `${c.qty}x ${c.name} (${c.setName || '?'}) — $${(parseFloat(c.price) || 0).toFixed(2)}`
    ).join('\n') + `\n\nTotal: $${tradeValue.toFixed(2)}`
    navigator.clipboard.writeText(text).then(
      () => showToast('Trade list copied ✓'),
      () => showToast('Copy failed')
    )
  }

  // ── Filtering (memoized) ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let base = view === 'sell' ? collection.filter(c => c.forSale) : collection
    if (search)
      base = base.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    if (filterColors.length > 0)
      base = base.filter(c => filterColors.some(col => (c.colors || []).includes(col)))
    if (filterRarity)
      base = base.filter(c => (c.rarity || '').toLowerCase() === filterRarity)
    if (filterCondition)
      base = base.filter(c => (c.condition || 'NM') === filterCondition)
    if (filterFoil === 'foil')
      base = base.filter(c => c.isFoil)
    if (filterFoil === 'nonfoil')
      base = base.filter(c => !c.isFoil)
    if (filterMinPrice !== '')
      base = base.filter(c => (parseFloat(c.price) || 0) >= parseFloat(filterMinPrice))
    if (filterMaxPrice !== '')
      base = base.filter(c => (parseFloat(c.price) || 0) <= parseFloat(filterMaxPrice))
    return base
  }, [collection, view, search, filterColors, filterRarity, filterCondition, filterFoil, filterMinPrice, filterMaxPrice])

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
          placeholder="Search cards…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 0, maxWidth: '220px' }}
        />
        <button className="btn btn-primary" onClick={() => openAddCard()}>+ Add</button>
        <button className="btn btn-ghost" onClick={() => openCamera()}>📷 Scan</button>
        <button
          className="btn btn-ghost"
          onClick={handleBulkRefresh}
          disabled={refreshing}
          title="Re-fetch prices from Scryfall"
          style={{ fontSize: '.78rem' }}
        >
          {refreshing ? `${refreshProg?.done || 0}/${refreshProg?.total || '?'}` : '🔄'}
        </button>
        <button className="btn btn-ghost" onClick={handleExport} title="Export CSV">⬇️</button>
        <button className="btn btn-ghost" onClick={handleBackup} title="Backup JSON">💾</button>
        <span style={{ marginLeft: 'auto', fontSize: '.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {total} cards
          {totalValue > 0 && (
            <span style={{ color: 'var(--accent-gold)', marginLeft: '8px' }}>${totalValue.toFixed(2)}</span>
          )}
        </span>
      </div>

      {/* Refresh progress bar */}
      {refreshing && refreshProg && (
        <div style={{ height: '3px', background: 'var(--bg-hover)', borderRadius: '99px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--accent-teal)', borderRadius: '99px',
            width: `${(refreshProg.done / refreshProg.total) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>
      )}

      {/* ── View tabs ── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '0', overflowX: 'auto' }}>
        {[
          ['all',   `All (${collection.length})`],
          ['sell',  `🏷️ Sell${forSaleCount > 0 ? ` (${forSaleCount})` : ''}`],
          ['trade', '⚖️ Trade'],
          ['sets',  '🗺️ Sets'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            style={{
              padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '.8rem', fontWeight: view === id ? 700 : 400,
              color: view === id ? 'var(--accent-teal)' : 'var(--text-muted)',
              borderBottom: view === id ? '2px solid var(--accent-teal)' : '2px solid transparent',
              marginBottom: '-1px', whiteSpace: 'nowrap', transition: 'color .15s',
            }}
          >
            {label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}>
          {ebayConnected
            ? <span style={{ fontSize: '.7rem', color: 'var(--accent-green)', fontWeight: 600 }}>✓ eBay</span>
            : <button className="btn btn-ghost btn-sm" onClick={connectEbay} style={{ fontSize: '.68rem' }}>🔗 eBay</button>
          }
        </div>
      </div>

      {/* ── Filter row (All + Sell views) ── */}
      {(view === 'all' || view === 'sell') && (
        <div style={{ marginTop: '12px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: showFilters ? '12px' : '0' }}>
            <button
              onClick={() => setShowFilters(f => !f)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '99px',
                border: `1.5px solid ${activeFilterCount > 0 ? 'var(--accent-teal)' : 'var(--border)'}`,
                background: activeFilterCount > 0 ? 'rgba(245,158,11,.1)' : 'var(--bg-secondary)',
                color: activeFilterCount > 0 ? 'var(--accent-teal)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '.75rem', fontWeight: 600,
              }}
            >
              ⚙️ Filter
              {activeFilterCount > 0 && (
                <span style={{
                  background: 'var(--accent-teal)', color: '#1a1000',
                  borderRadius: '99px', padding: '0 6px', fontSize: '.65rem', fontWeight: 800, minWidth: '18px', textAlign: 'center',
                }}>
                  {activeFilterCount}
                </span>
              )}
              <span style={{ opacity: 0.5, fontSize: '.65rem' }}>{showFilters ? '▲' : '▼'}</span>
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '.7rem', color: 'var(--text-muted)',
                }}
              >
                Clear all
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '.72rem', color: 'var(--text-muted)' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {showFilters && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: '14px',
              marginBottom: '12px',
            }}>
              {/* Colors */}
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
                  labelFn={r => ({ common: '● Common', uncommon: '◈ Uncommon', rare: '◆ Rare', mythic: '✦ Mythic' }[r] || r)}
                />
              </div>

              {/* Condition */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Condition</div>
                <ChipRow options={CONDITION_OPTIONS} value={filterCondition} onChange={setFilterCondition} />
              </div>

              {/* Foil */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Finish</div>
                <ChipRow
                  options={['foil', 'nonfoil']}
                  value={filterFoil}
                  onChange={setFilterFoil}
                  labelFn={v => v === 'foil' ? '✦ Foil' : 'Non-Foil'}
                />
              </div>

              {/* Price range */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Price Range</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="Min"
                      value={filterMinPrice}
                      onChange={e => setFilterMinPrice(e.target.value)}
                      className="form-input"
                      style={{ width: '72px', padding: '5px 8px', fontSize: '.78rem' }}
                    />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>–</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="Max"
                      value={filterMaxPrice}
                      onChange={e => setFilterMaxPrice(e.target.value)}
                      className="form-input"
                      style={{ width: '72px', padding: '5px 8px', fontSize: '.78rem' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Set Tracker ── */}
      {view === 'sets' && (
        <div style={{ marginTop: '20px' }}>
          <SetTracker collection={collection} />
        </div>
      )}

      {/* ── Trade Calculator ── */}
      {view === 'trade' && (
        <div style={{ marginTop: '16px' }}>
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
                Tap cards to add them to your trade pile.
              </div>
              <div className="collection-grid">
                {collection.map(card => {
                  const sel = tradeSelect.has(card.id)
                  return (
                    <div
                      key={card.id}
                      onClick={() => toggleTradeSelect(card.id)}
                      style={{
                        position: 'relative',
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

      {/* ── Empty states ── */}
      {view === 'all' && filtered.length === 0 && activeFilterCount === 0 && !search && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">💎</div>
          <p>Collection is empty.<br />Add cards manually or scan them!</p>
          <button className="btn btn-primary" onClick={() => openAddCard()} style={{ marginTop: '16px' }}>+ Add Card</button>
        </div>
      )}
      {(view === 'all' || view === 'sell') && filtered.length === 0 && (activeFilterCount > 0 || search) && (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <div className="empty-icon">🔍</div>
          <p>No cards match your filters.</p>
          <button className="btn btn-ghost" onClick={clearFilters} style={{ marginTop: '12px' }}>Clear filters</button>
        </div>
      )}
      {view === 'sell' && filtered.length === 0 && !search && activeFilterCount === 0 && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">🏷️</div>
          <p>No cards marked for sale yet.<br />Tap the 🏷️ on any card to list it.</p>
          <button className="btn btn-ghost" onClick={() => setView('all')} style={{ marginTop: '16px' }}>← All Cards</button>
        </div>
      )}

      {/* ── All Cards grid ── */}
      {view === 'all' && filtered.length > 0 && (() => {
        // Compute sell signal summary
        const ckHasData = Object.keys(ckMap).length > 0
        let strongCount = 0
        let goodCount   = 0
        let totalCKCash = 0
        if (ckHasData) {
          filtered.forEach(card => {
            const market = parseFloat(card.price) || 0
            if (market < 1) return
            const ckBuy = getCKBuyPrice(ckMap, card.name, card.isFoil)
            const signal = getSellSignal(ckBuy, market)
            if (!signal) return
            if (signal === 'strong') strongCount++
            else goodCount++
            totalCKCash += ckBuy * (card.qty || 1)
          })
        }
        const hasSignals = strongCount > 0 || goodCount > 0

        return (
          <>
            {/* Sell Signals summary bar */}
            {ckHasData && hasSignals && (
              <div style={{
                margin: '8px 0 4px',
                background: 'rgba(202,138,4,.12)',
                border: '1px solid rgba(202,138,4,.35)',
                borderRadius: '10px',
                padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                fontSize: '.75rem', color: 'var(--accent-gold)',
              }}>
                <span style={{ fontWeight: 800 }}>💰 Sell Signals</span>
                {strongCount > 0 && (
                  <span style={{
                    background: '#16a34a', color: '#fff',
                    borderRadius: '4px', padding: '1px 7px',
                    fontSize: '.68rem', fontWeight: 800,
                  }}>
                    🔥 {strongCount} Strong
                  </span>
                )}
                {goodCount > 0 && (
                  <span style={{
                    background: '#ca8a04', color: '#fff',
                    borderRadius: '4px', padding: '1px 7px',
                    fontSize: '.68rem', fontWeight: 800,
                  }}>
                    💰 {goodCount} Good
                  </span>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--accent-gold)', fontWeight: 700 }}>
                  CK cash: ${totalCKCash.toFixed(2)}
                </span>
              </div>
            )}

            <div className="collection-grid" style={{ marginTop: '8px' }}>
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
                      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {card.condition}{card.isFoil ? ' · ✦ Foil' : ''}
                      </div>
                    )}
                  </div>
                  <span className="col-card-qty">×{card.qty}</span>

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
                  <a
                    href={getTCGPlayerLink(card.tcgplayerUrl || card.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Buy on TCGPlayer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', bottom: '6px', right: '6px',
                      background: 'rgba(74,222,128,.15)', color: '#4ade80',
                      borderRadius: '4px', padding: '2px 5px',
                      fontSize: '.6rem', fontWeight: 700, textDecoration: 'none',
                      lineHeight: 1.5,
                    }}
                  >
                    🛒
                  </a>

                  {(() => {
                    const market = parseFloat(card.price) || 0
                    if (market < 1) return null
                    const ckBuy = getCKBuyPrice(ckMap, card.name, card.isFoil)
                    const signal = getSellSignal(ckBuy, market)
                    if (!signal) return null
                    return (
                      <div style={{
                        position: 'absolute', bottom: '6px', left: '6px',
                        background: signal === 'strong' ? '#16a34a' : '#ca8a04',
                        color: '#fff', borderRadius: '4px',
                        fontSize: '.55rem', fontWeight: 800,
                        padding: '2px 5px', letterSpacing: '.3px',
                        textTransform: 'uppercase',
                      }}>
                        {signal === 'strong' ? '🔥 Sell' : '💰 Sell?'}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </>
        )
      })()}

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
              onUpdatePrice={p => updateCard(card.id, { salePrice: p })}
              onUpdateQty={q  => updateCard(card.id, { sellQty: q })}
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
  const tcgUrl = getTCGPlayerLink(card.name)
  const suggested = suggestPrice(parseFloat(card.price) || 0)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '12px 14px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: '10px',
    }}>
      {card.img
        ? <img src={card.img} alt={card.name} style={{ width: '42px', borderRadius: '4px', flexShrink: 0 }} />
        : <div style={{ width: '42px', height: '60px', background: 'var(--bg-secondary)', borderRadius: '4px', flexShrink: 0 }} />
      }

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
