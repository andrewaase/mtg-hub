import { useState, useEffect, useRef, useMemo, useCallback, Component } from 'react'
import { createPortal } from 'react-dom'
import { getDecks, saveDeck, deleteDeck, bulkAddCards } from '../lib/db'
import { toArenaFormat, countCards, isCommanderFormat, FORMAT_COLORS, parseArenaDecklist } from '../lib/deckUtils'
import { getDeckValueSync, fetchUnknownDeckPrices, prefetchDeckPrices, getCachedPrice } from '../lib/pricing'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { getManaPoolLink } from '../lib/manapool'
import { supabase } from '../lib/supabase'
import ImportDeckModal from '../modals/ImportDeckModal'
import UpgradeModal from '../components/UpgradeModal'

//  Meta Explore constants 
const META_FORMATS = ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Pauper', 'Commander', 'Brawl', 'Premodern']
const ARCHETYPE_COLOR = {
  Aggro:     { bg: 'rgba(248,113,113,.12)', border: '#f87171', text: '#f87171' },
  Control:   { bg: 'rgba(99,163,255,.12)',  border: '#63a3ff', text: '#63a3ff' },
  Midrange:  { bg: 'rgba(74,222,128,.12)',  border: '#4ade80', text: '#4ade80' },
  Combo:     { bg: 'rgba(167,139,250,.12)', border: '#a78bfa', text: '#a78bfa' },
  Tempo:     { bg: 'rgba(61,214,186,.12)',  border: '#3dd6ba', text: '#3dd6ba' },
  Ramp:      { bg: 'rgba(74,222,128,.12)',  border: '#4ade80', text: '#4ade80' },
}

const FORMAT_ALL = 'All'

//  Card type grouping 
const TYPE_ORDER = [
  { key: 'Creature',     label: ' Creatures',    test: t => /\bCreature\b/.test(t) },
  { key: 'Planeswalker', label: ' Planeswalkers', test: t => /\bPlaneswalker\b/.test(t) },
  { key: 'Battle',       label: ' Battles',       test: t => /\bBattle\b/.test(t) },
  { key: 'Instant',      label: ' Instants',      test: t => /\bInstant\b/.test(t) },
  { key: 'Sorcery',      label: ' Sorceries',     test: t => /\bSorcery\b/.test(t) },
  { key: 'Enchantment',  label: ' Enchantments',  test: t => /\bEnchantment\b/.test(t) && !/\bCreature\b/.test(t) },
  { key: 'Artifact',     label: ' Artifacts',     test: t => /\bArtifact\b/.test(t) && !/\bCreature\b/.test(t) },
  { key: 'Land',         label: ' Lands',         test: t => /\bLand\b/.test(t) },
  { key: 'Other',        label: ' Other',          test: () => true },
]

function getTypeBucket(typeLine) {
  for (const g of TYPE_ORDER) {
    if (g.test(typeLine || '')) return g.key
  }
  return 'Other'
}

// Module-level card image cache (survives re-renders)
const IMG_CACHE = new Map()

// Batch-fetch Scryfall prices for all meta decks that have a stored decklist.
// Returns { [deckId]: totalPrice } for every deck we could price.
async function batchFetchMetaPrices(decks) {
  // Collect unique card names across all decklists
  const nameSet = new Set()
  decks.forEach(d => {
    const dl = (() => {
      if (!d.decklist) return null
      if (typeof d.decklist === 'object') return d.decklist
      try { return JSON.parse(d.decklist) } catch { return null }
    })()
    if (!dl) return
    ;(dl.mainboard || []).forEach(c => nameSet.add(c.name))
  })

  if (nameSet.size === 0) return {}

  // Scryfall /cards/collection: up to 75 identifiers per request
  const names = [...nameSet]
  const BATCH = 75
  const priceMap = {} // cardName → usd price
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH)
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(n => ({ name: n })) }),
      })
      if (!res.ok) continue
      const { data = [] } = await res.json()
      data.forEach(card => {
        const p = parseFloat(card.prices?.usd)
        if (p > 0) {
          priceMap[card.name] = p
          // Also index by front face so "A // B" stored cards resolve
          const front = card.name.split(' // ')[0]
          if (front !== card.name) priceMap[front] = p
        }
      })
    } catch { /* non-fatal */ }
    // Brief pause between batches to respect Scryfall rate limits
    if (i + BATCH < names.length) await new Promise(r => setTimeout(r, 100))
  }

  // Compute per-deck totals
  const result = {}
  decks.forEach(d => {
    const dl = (() => {
      if (!d.decklist) return null
      if (typeof d.decklist === 'object') return d.decklist
      try { return JSON.parse(d.decklist) } catch { return null }
    })()
    if (!dl) return
    let total = 0
    ;(dl.mainboard || []).forEach(c => {
      const p = priceMap[c.name]
      if (p) total += p * c.qty
    })
    if (total > 0) result[d.id] = total
  })
  return result
}

//  Main Decks page 
export default function Decks({ user, collection, showToast, setDeckModalOpen, openCardSearch, membership, setPage, openDeckBuilder }) {
  const [decks, setDecks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [editDeck, setEditDeck]     = useState(null)
  const [formatFilter, setFormatFilter] = useState(FORMAT_ALL)
  const [activeTab, setActiveTab]   = useState('my')
  const [copied, setCopied]         = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  // priceVersion increments after background prefetch so DeckArtTile re-reads the cache
  const [priceVersion, setPriceVersion] = useState(0)
  const prefetchedRef  = useRef(false)

  //  Meta Explore state 
  const [metaDecks,        setMetaDecks]        = useState([])
  const [metaLoading,      setMetaLoading]      = useState(false)
  const [metaFormat,       setMetaFormat]       = useState('Standard')
  const [metaLoaded,       setMetaLoaded]       = useState(false)
  const [selectedMetaDeck, setSelectedMetaDeck] = useState(null)
  const [metaDeckPrices,   setMetaDeckPrices]   = useState({}) // id → computed price

  useEffect(() => {
    getDecks(user?.id).then(d => {
      setDecks(d)
      setLoading(false)
      // Kick off background price prefetch for all decks as soon as they load.
      // Guards with a ref so it only runs once per session even if user changes.
      if (d.length > 0 && !prefetchedRef.current) {
        prefetchedRef.current = true
        prefetchDeckPrices(d, collection)
          .then(count => { if (count > 0) setPriceVersion(v => v + 1) })
          .catch(() => {})
      }
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load meta decks when Explore tab opens (once)
  useEffect(() => {
    if (activeTab !== 'explore' || metaLoaded) return
    setMetaLoading(true)
    supabase
      .from('meta_decks')
      .select('*')
      .order('meta_share', { ascending: false })
      .then(({ data }) => {
        const decks = data || []
        setMetaDecks(decks)
        setMetaLoaded(true)
        setMetaLoading(false)
        // Batch-fetch Scryfall prices for all decks that have a stored decklist
        batchFetchMetaPrices(decks).then(prices => {
          setMetaDeckPrices(prices)
          // Write computed prices back to Supabase for decks that don't have avg_price yet
          decks.forEach(d => {
            if (d.avg_price == null && prices[d.id] > 0) {
              supabase.from('meta_decks').update({ avg_price: Math.round(prices[d.id]) }).eq('id', d.id).then(() => {})
            }
          })
        })
      })
      .catch(() => setMetaLoading(false))
  }, [activeTab, metaLoaded])

  // Block sidebar navigation while deck modal is open
  useEffect(() => {
    setDeckModalOpen?.(showImport)
    return () => setDeckModalOpen?.(false)
  }, [showImport, setDeckModalOpen])

  //  CRUD 
  const handleSave = async (deckData) => {
    try {
      const saved = await saveDeck(deckData, user?.id)
      if (deckData.id) {
        setDecks(prev => prev.map(d => d.id === deckData.id ? saved : d))
        if (selected?.id === deckData.id) setSelected(saved)
      } else {
        setDecks(prev => [saved, ...prev])
      }
      setShowImport(false)
      setEditDeck(null)
      showToast(deckData.id ? 'Deck updated ✓' : 'Deck saved ✓')
    } catch (err) {
      console.error('[Decks] save error:', err)
      if (!user) {
        showToast('Sign in to save decks to your profile')
      } else {
        showToast(`Save failed: ${err.message}`)
      }
    }
  }

  const handleDelete = async (deck) => {
    if (!window.confirm(`Delete "${deck.name}"? This can't be undone.`)) return
    await deleteDeck(deck.id, user?.id)
    setDecks(prev => prev.filter(d => d.id !== deck.id))
    if (selected?.id === deck.id) setSelected(null)
    showToast('Deck deleted')
  }

  const handleCopyArena = async (deck) => {
    const text = toArenaFormat(deck)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      showToast('Copied to clipboard. Paste into MTG Arena ✓')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      showToast('Copy failed. Try selecting the text manually')
    }
  }

  //  Filtering 
  const formats  = [FORMAT_ALL, ...Array.from(new Set(decks.map(d => d.format))).sort()]
  const filtered = formatFilter === FORMAT_ALL ? decks : decks.filter(d => d.format === formatFilter)

  //  Detail view 
  if (selected) {
    return (
      <DeckDetail
        deck={selected}
        collection={collection}
        user={user}
        showToast={showToast}
        onBack={() => setSelected(null)}
        onEdit={() => { setEditDeck(selected); setShowImport(true) }}
        onDelete={() => handleDelete(selected)}
        onCopyArena={() => handleCopyArena(selected)}
        copied={copied}
        showModal={showImport}
        onModalClose={() => { setShowImport(false); setEditDeck(null) }}
        onModalSave={handleSave}
        editDeck={editDeck}
        openCardSearch={openCardSearch}
      />
    )
  }

  //  Group decks 
  const grouped = {}
  filtered.forEach(deck => {
    const group = deck.group || 'My Decks'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(deck)
  })

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        {[['my', ' My Decks'], ['explore', ' Explore Meta']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '6px 14px', background: activeTab === key ? 'var(--accent-gold-glow)' : 'transparent',
            border: `1px solid ${activeTab === key ? 'var(--accent-gold)' : 'var(--border)'}`,
            borderRadius: '99px', cursor: 'pointer',
            fontSize: '.78rem', fontWeight: 600,
            color: activeTab === key ? 'var(--accent-gold)' : 'var(--text-muted)',
            transition: 'all .15s',
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {activeTab === 'my' && (
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'center', marginRight: '16px', fontSize: '.78rem' }}
            onClick={() => {
              if (!openDeckBuilder?.()) return
              const deckLimit = membership?.deckLimit ?? 10
              const isPro     = membership?.isPro ?? false
              if (!isPro && decks.length >= deckLimit) {
                setShowUpgrade(true)
                return
              }
              setEditDeck(null)
              setShowImport(true)
            }}>+ New</button>
        )}
      </div>

      {activeTab === 'explore' ? (
        selectedMetaDeck ? (
          <MetaDetailErrorBoundary onBack={() => setSelectedMetaDeck(null)}>
            <MetaDeckDetail
              deck={selectedMetaDeck}
              onBack={() => setSelectedMetaDeck(null)}
              onSave={handleSave}
              showToast={showToast}
              openCardSearch={openCardSearch}
              user={user}
            />
          </MetaDetailErrorBoundary>
        ) : (
        <div style={{ paddingBottom: 32 }}>
          {/* Format filter pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
            {META_FORMATS.map(f => (
              <button key={f} onClick={() => setMetaFormat(f)} style={{
                padding: '5px 13px', borderRadius: 99, fontSize: '.74rem', fontWeight: 600,
                background: metaFormat === f ? 'var(--accent-gold-glow)' : 'transparent',
                border: `1px solid ${metaFormat === f ? 'var(--accent-gold)' : 'var(--border)'}`,
                color: metaFormat === f ? 'var(--accent-gold)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all .15s',
              }}>{f}</button>
            ))}
            <button
              onClick={() => { setMetaLoaded(false) }}
              style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 99, fontSize: '.7rem', fontWeight: 600, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
              title="Refresh meta data"
            >⟳</button>
          </div>

          {metaLoading ? (
            <div className="deck-art-grid">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="deck-art-tile" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          ) : (() => {
            const filteredMeta = metaDecks.filter(d => d.format === metaFormat)
            const lastUpdated = filteredMeta.length > 0
              ? filteredMeta.reduce((latest, d) => (!latest || d.updated_at > latest ? d.updated_at : latest), null)
              : null

            if (filteredMeta.length === 0) {
              return (
                <div className="empty-state" style={{ padding: '60px 20px' }}>
                  <div className="empty-icon"></div>
                  <p>No meta data for {metaFormat} yet.<br />
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      Add decks via the Admin Panel → Meta tab.
                    </span>
                  </p>
                </div>
              )
            }

            return (
              <>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>
                    {filteredMeta.length} decks · {metaFormat}
                  </div>
                  {lastUpdated && (
                    <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
                      Updated {new Date(lastUpdated + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>

                {/* Tile grid — uses same CSS as My Decks for consistent sizing */}
                <div className="deck-art-grid">
                  {filteredMeta.map(deck => (
                    <MetaTile key={deck.id} deck={deck} computedPrice={metaDeckPrices[deck.id]} onClick={() => setSelectedMetaDeck(deck)} />
                  ))}
                </div>
              </>
            )
          })()}
        </div>
        )
      ) : (
        <>
          {decks.length > 0 && (
            <div className="tabs" style={{ marginBottom: '16px' }}>
              {formats.map(f => (
                <button key={f} className={`tab ${formatFilter === f ? 'active' : ''}`} onClick={() => setFormatFilter(f)}>{f}</button>
              ))}
            </div>
          )}

          {!loading && decks.length === 0 && (
            <div className="empty-state" style={{ padding: '60px 20px' }}>
              <div className="empty-icon"></div>
              <p>No decks yet.<br />Import a decklist to get started.</p>
              <button className="btn btn-primary" onClick={() => { if (openDeckBuilder?.()) setShowImport(true) }} style={{ marginTop: '16px' }}>
                + Import Deck
              </button>
            </div>
          )}

          {!user && decks.length > 0 && (
            <div style={{ background: 'rgba(61,214,186,.08)', border: '1px solid rgba(61,214,186,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '.8rem', color: '#3dd6ba' }}>
               Sign in to save decks to your profile. Decks stored locally will be lost on refresh.
            </div>
          )}

          {Object.entries(grouped).map(([group, groupDecks]) => (
            <div key={group} style={{ padding: '0 16px' }}>
              {Object.keys(grouped).length > 1 && (
                <div className="deck-group-label"> {group}</div>
              )}
              <div className="deck-art-grid">
                {groupDecks.map(deck => (
                  <DeckArtTile
                    key={deck.id}
                    deck={deck}
                    collection={collection}
                    priceVersion={priceVersion}
                    onClick={() => setSelected(deck)}
                    onEdit={() => { setEditDeck(deck); setShowImport(true) }}
                    onDelete={() => handleDelete(deck)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {showImport && (
        <ImportDeckModal
          existingDeck={editDeck}
          onClose={() => { setShowImport(false); setEditDeck(null) }}
          onSave={handleSave}
        />
      )}
      {showUpgrade && (
        <UpgradeModal
          reason="deck"
          onClose={() => setShowUpgrade(false)}
          setPage={setPage}
        />
      )}
    </div>
  )
}

//  Deck art tile 
function DeckArtTile({ deck, collection, onClick, onEdit, onDelete, priceVersion = 0 }) {
  const [artUrl, setArtUrl] = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    const cardName = deck.commander || deck.mainboard?.[0]?.name
    if (!cardName) return
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(card => {
        const url = card?.image_uris?.art_crop || card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.art_crop
        if (url) setArtUrl(url)
      })
      .catch(() => {})
  }, [deck])

  const { main } = countCards(deck)
  const isCmdr  = isCommanderFormat(deck.format)
  const deckVal = useMemo(() => getDeckValueSync(deck, collection || []), [deck, collection, priceVersion])
  const price   = deckVal.cachedValue > 0
    ? deckVal.cachedValue >= 1000
      ? `$${(deckVal.cachedValue / 1000).toFixed(1)}k`
      : `$${deckVal.cachedValue.toFixed(2)}`
    : null

  return (
    <div className="deck-art-tile" onClick={onClick}>
      {artUrl
        ? <img src={artUrl} alt={deck.name} className="deck-art-tile-img" />
        : <div className="deck-art-tile-placeholder" style={{ background: `linear-gradient(135deg, ${FORMAT_COLORS[deck.format]?.bg || '#1a1a1c'}, #0d0d0f)` }}></div>
      }
      <div className="deck-art-tile-overlay" />
      <div className="deck-art-tile-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
          <div className="deck-art-tile-name" style={{ flex: 1, minWidth: 0 }}>{deck.name}</div>
          {price && (
            <div style={{
              fontSize: '.75rem', fontWeight: 800, color: 'var(--accent-gold)',
              flexShrink: 0, textShadow: '0 1px 4px rgba(0,0,0,.8)',
            }}>
              {price}
            </div>
          )}
        </div>
        <div className="deck-art-tile-format">
          {deck.format}{isCmdr && deck.commander ? ` · ${deck.commander}` : ''} · {main} cards
        </div>
      </div>
      <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}
           onClick={e => e.stopPropagation()}>
        <button onClick={onEdit}   style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '.68rem', color: '#fff', cursor: 'pointer' }}></button>
        <button onClick={onDelete} style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '.68rem', color: '#f87171', cursor: 'pointer' }}></button>
      </div>
    </div>
  )
}

//  Mana symbol pip 
function ManaSymbol({ c, size = 16 }) {
  return (
    <img
      src={`https://svgs.scryfall.io/card-symbols/${c.toUpperCase()}.svg`}
      alt={c}
      style={{ width: size, height: size, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.8))' }}
    />
  )
}

// Color name mapping for mono-color deck tile text
const MONO_COLOR_TEXT = {
  W: '#f5f0dc',   // cream
  U: '#7ec8f0',   // sky blue
  B: '#a78bfa',   // violet
  R: '#f9a07a',   // salmon
  G: '#86efac',   // mint
}

//  Meta tile — matches DeckArtTile exactly, adds META% in the subtitle 
function MetaTile({ deck, computedPrice, onClick }) {
  const [artUrl, setArtUrl] = useState(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    const cardName = deck.art_card || deck.deck_name
    if (!cardName) return
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(card => {
        const url = card?.image_uris?.art_crop || card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.art_crop
        if (url) setArtUrl(url)
      })
      .catch(() => {})
  }, [deck.art_card, deck.deck_name])

  const share = parseFloat(deck.meta_share) || 0
  // Prefer the DB-stored avg_price (fast, always available), fall back to the
  // batch-computed price that arrives a few seconds after the explore tab loads
  const price = parseFloat(deck.avg_price) || computedPrice || null
  const priceLabel = price
    ? price >= 1000 ? `$${(price / 1000).toFixed(1)}k` : `$${price.toFixed(0)}`
    : null

  // Subtitle: "Standard · 11.5% META" (or just "11.5% META" if no format)
  const subtitle = [
    deck.format,
    share > 0 ? `${share.toFixed(1)}% META` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="deck-art-tile" onClick={onClick}>
      {artUrl
        ? <img src={artUrl} alt={deck.deck_name} className="deck-art-tile-img" />
        : <div className="deck-art-tile-placeholder" style={{ background: 'linear-gradient(135deg, #1a1a2e, #0d0d0f)' }}></div>
      }
      <div className="deck-art-tile-overlay" />
      <div className="deck-art-tile-body">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, justifyContent: 'space-between' }}>
          <div className="deck-art-tile-name" style={{ flex: 1, minWidth: 0 }}>{deck.deck_name}</div>
          {priceLabel && (
            <div style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--accent-gold)', flexShrink: 0, textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>
              {priceLabel}
            </div>
          )}
        </div>
        <div className="deck-art-tile-format">{subtitle}</div>
      </div>
    </div>
  )
}

//  Error boundary for MetaDeckDetail 
class MetaDetailErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMsg: '' }
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, errorMsg: err?.message || 'Unknown error' }
  }
  componentDidCatch(err, info) {
    console.error('[MetaDeckDetail] render error:', err, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ paddingBottom: 40 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={this.props.onBack}
            style={{ marginBottom: 16 }}
          >
            ← Back to Meta
          </button>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid rgba(248,113,113,.3)',
            borderRadius: 12, padding: '32px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}></div>
            <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 6 }}>
              Something went wrong loading this deck
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
              {this.state.errorMsg}
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

//  Meta deck detail (full-page view) 
function MetaDeckDetail({ deck, onBack, onSave, showToast, openCardSearch, user }) {
  const [artUrl,           setArtUrl]           = useState(null)
  const [cardTypes,        setCardTypes]        = useState({})
  const [cardPrices,       setCardPrices]       = useState({})
  const [typesLoading,     setTypesLoading]     = useState(false)
  const [saving,           setSaving]           = useState(false)
  const [liveDeck,         setLiveDeck]         = useState(null)  // fetched on-the-fly
  const [deckFetching,     setDeckFetching]     = useState(false)
  const artFetchedRef = useRef(false)

  // Parse decklist from stored JSON
  const storedDecklist = (() => {
    if (!deck.decklist) return { mainboard: [], sideboard: [] }
    if (typeof deck.decklist === 'object') return deck.decklist
    try { return JSON.parse(deck.decklist) } catch { return { mainboard: [], sideboard: [] } }
  })()

  // Use live-fetched decklist when available, otherwise fall back to stored
  const decklist = liveDeck || storedDecklist
  const mainboard = decklist.mainboard || []
  const sideboard = decklist.sideboard || []

  // Auto-fetch decklist from link when no cards are stored
  useEffect(() => {
    const link = deck.decklist_link?.trim()
    if (!link) return
    if ((storedDecklist.mainboard || []).length > 0) return  // already have cards
    setDeckFetching(true)
    fetch('/.netlify/functions/fetch-decklist', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: link }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error)
        const parsed = parseArenaDecklist(json.text)
        if ((parsed.mainboard || []).length > 0) {
          setLiveDeck(parsed)
          // Write back to Supabase so next load is instant
          supabase.from('meta_decks').update({ decklist: parsed }).eq('id', deck.id).then(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setDeckFetching(false))
  }, [deck.id, deck.decklist_link]) // eslint-disable-line react-hooks/exhaustive-deps

  const colors = deck.colors ? deck.colors.split('') : []

  // Fetch art crop for hero image
  useEffect(() => {
    if (artFetchedRef.current) return
    artFetchedRef.current = true
    const cardName = deck.art_card || deck.deck_name
    if (!cardName) return
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(card => {
        const url = card?.image_uris?.art_crop || card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.art_crop
        if (url) setArtUrl(url)
      })
      .catch(() => {})
  }, [deck.art_card, deck.deck_name])

  // Fetch card types + prices from Scryfall for mainboard
  useEffect(() => {
    if (mainboard.length === 0) return
    setTypesLoading(true)
    const uniqueNames = [...new Set(mainboard.map(c => c.name))]
    const BATCH = 75
    const promises = []
    for (let i = 0; i < uniqueNames.length; i += BATCH) {
      const batch = uniqueNames.slice(i, i + BATCH)
      promises.push(
        fetch('https://api.scryfall.com/cards/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifiers: batch.map(n => ({ name: n })) }),
        })
        .then(r => r.ok ? r.json() : { data: [] })
        .then(({ data = [] }) => {
          const types = {}, prices = {}
          for (const card of data) {
            const typeLine = (card.type_line || '').split(' // ')[0]
            types[card.name] = typeLine
            const frontName = card.name.split(' // ')[0]
            if (frontName !== card.name) types[frontName] = typeLine
            const price = parseFloat(card.prices?.usd) || null
            if (price != null) {
              prices[card.name] = price
              if (frontName !== card.name) prices[frontName] = price
            }
            // Pre-populate the module-level IMG_CACHE so CardRow hover is instant
            const img = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null
            if (img) {
              IMG_CACHE.set(card.name, img)
              if (frontName !== card.name) IMG_CACHE.set(frontName, img)
            }
          }
          return { types, prices }
        })
        .catch(() => ({ types: {}, prices: {} }))
      )
    }
    Promise.all(promises).then(results => {
      setCardTypes(Object.assign({}, ...results.map(r => r.types)))
      setCardPrices(Object.assign({}, ...results.map(r => r.prices)))
      setTypesLoading(false)
    })
  }, [deck.id, mainboard.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build type groups for mainboard
  const typeGroups = useMemo(() => {
    if (typesLoading || mainboard.length === 0) return null
    const buckets = {}
    for (const card of mainboard) {
      const bucket = getTypeBucket(cardTypes[card.name] || '')
      if (!buckets[bucket]) buckets[bucket] = []
      buckets[bucket].push(card)
    }
    return TYPE_ORDER
      .map(t => ({ ...t, cards: buckets[t.key] || [], count: (buckets[t.key] || []).reduce((s, c) => s + c.qty, 0) }))
      .filter(t => t.cards.length > 0)
  }, [mainboard, cardTypes, typesLoading])

  // Total deck price from fetched card prices
  const totalPrice = useMemo(() => {
    let sum = 0
    for (const card of mainboard) {
      const p = cardPrices[card.name]
      if (p != null) sum += p * card.qty
    }
    return sum
  }, [mainboard, cardPrices])

  // Write computed price back to Supabase so the tile shows it next visit
  useEffect(() => {
    if (totalPrice <= 0) return
    if (deck.avg_price != null) return  // already has a manually set price
    supabase.from('meta_decks').update({ avg_price: Math.round(totalPrice) }).eq('id', deck.id).then(() => {})
  }, [totalPrice, deck.id, deck.avg_price])

  // Copy Arena format to clipboard
  const handleCopyArena = async () => {
    const lines = [
      'Deck',
      ...mainboard.map(c => `${c.qty} ${c.name}`),
      ...(sideboard.length > 0 ? ['', 'Sideboard', ...sideboard.map(c => `${c.qty} ${c.name}`)] : []),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(lines)
      showToast('Copied to clipboard. Paste into MTG Arena ✓')
    } catch {
      showToast('Copy failed. Try selecting the text manually')
    }
  }

  // Save to My Decks
  const handleSaveToMyDecks = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave({ name: deck.deck_name, format: deck.format, mainboard, sideboard })
      showToast('Saved to My Decks ✓')
    } catch (err) {
      showToast(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // TCGPlayer: copy list and open mass entry
  const TCG_MASSENTRY = 'https://partner.tcgplayer.com/c/7200332/1780961/21018'
    + '?u=' + encodeURIComponent('https://www.tcgplayer.com/massentry')
  const handleTCGPlayer = async () => {
    const text = mainboard.map(c => `${c.qty} ${c.name}`).join('\n')
    try { await navigator.clipboard.writeText(text) } catch { /* ok */ }
    window.open(TCG_MASSENTRY, '_blank', 'noopener')
    showToast('Decklist copied — paste it into TCGPlayer Mass Entry!')
  }

  // ManaPool affiliate
  const handleManaPool = async () => {
    const text = mainboard.map(c => `${c.qty} ${c.name}`).join('\n')
    try { await navigator.clipboard.writeText(text) } catch { /* ok */ }
    window.open('https://manapool.com/add-deck?ref=manamint', '_blank', 'noopener')
    showToast('Decklist copied — paste it into ManaPool!')
  }

  const share = parseFloat(deck.meta_share) || 0
  const price = parseFloat(deck.avg_price) || null

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Back button */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ marginBottom: 16 }}
      >
        ← Back to Meta
      </button>

      {/* Hero section */}
      <div style={{
        position: 'relative', borderRadius: 14, overflow: 'hidden',
        height: 180, marginBottom: 16, background: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}>
        {artUrl && (
          <img
            src={artUrl}
            alt={deck.deck_name}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,.2) 0%, rgba(0,0,0,.7) 60%, rgba(0,0,0,.92) 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px' }}>
          {colors.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {colors.map((c, i) => <ManaSymbol key={i} c={c} />)}
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.9)', lineHeight: 1.2 }}>
            {deck.deck_name}
          </h2>
          <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.65)', marginTop: 4 }}>
            {[deck.format, deck.archetype].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 0, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden', marginBottom: 14,
      }}>
        {[
          { label: 'META SHARE', value: share > 0 ? `${share.toFixed(1)}%` : '—', color: 'var(--accent-gold)' },
          { label: 'AVG PRICE',  value: price ? `~$${price.toFixed(0)}` : '—',     color: 'var(--text-primary)' },
        ].map((stat, i) => (
          <div key={stat.label} style={{
            flex: 1, padding: '12px 8px', textAlign: 'center',
            borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSaveToMyDecks}
          disabled={saving || mainboard.length === 0}
          style={{ fontSize: '.78rem' }}
        >
          {saving ? 'Saving…' : ' Save to My Decks'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleCopyArena}
          style={{ fontSize: '.78rem' }}
        >
           Copy to Arena
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleTCGPlayer}
          style={{ fontSize: '.78rem', color: '#4ade80' }}
        >
           Buy on TCGPlayer
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleManaPool}
          style={{ fontSize: '.78rem', color: '#38bdf8' }}
        >
           Buy on ManaPool
        </button>
      </div>

      {/* Decklist */}
      {mainboard.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '40px 20px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: '.85rem',
        }}>
          {deckFetching ? ' Loading decklist…' : 'No decklist available for this deck yet.'}
        </div>
      ) : (
        <>
          {/* Total computed price */}
          {totalPrice > 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>
                Deck Value (Scryfall prices)
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                ${totalPrice.toFixed(2)}
              </div>
            </div>
          )}

          {/* Mainboard type groups */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 14 }}>
            {typesLoading || !typeGroups
              ? (
                <DeckSection
                  title={`Main Deck (${mainboard.reduce((s, c) => s + c.qty, 0)})`}
                  cards={mainboard}
                  cardValues={cardPrices}
                  openCardSearch={openCardSearch}
                />
              )
              : typeGroups.map(group => (
                <DeckSection
                  key={group.key}
                  title={`${group.label} (${group.count})`}
                  cards={group.cards}
                  cardValues={cardPrices}
                  openCardSearch={openCardSearch}
                />
              ))
            }
          </div>

          {/* Sideboard */}
          {sideboard.length > 0 && (
            <DeckSection
              title={` Sideboard (${sideboard.reduce((s, c) => s + c.qty, 0)})`}
              cards={sideboard}
              cardValues={cardPrices}
              openCardSearch={openCardSearch}
            />
          )}
        </>
      )}

    </div>
  )
}

//  Deck stats bar: mana curve + color identity 
const COLOR_META = {
  W: { label: 'White',     color: '#f9fafb', bg: 'rgba(249,250,251,.18)' },
  U: { label: 'Blue',      color: '#60a5fa', bg: 'rgba(96,165,250,.22)'  },
  B: { label: 'Black',     color: '#a78bfa', bg: 'rgba(167,139,250,.22)' },
  R: { label: 'Red',       color: '#f87171', bg: 'rgba(248,113,113,.22)' },
  G: { label: 'Green',     color: '#4ade80', bg: 'rgba(74,222,128,.22)'  },
  C: { label: 'Colorless', color: '#94a3b8', bg: 'rgba(148,163,184,.18)' },
}

function DeckStatsBar({ mainboard, cardStats, cardTypes }) {
  //  Mana curve 
  const cmcBuckets = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } // 6 = "6+"
  for (const card of mainboard) {
    if (/\bLand\b/.test(cardTypes[card.name] || '')) continue // skip lands
    const cmc = Math.min(6, Math.floor(cardStats[card.name]?.cmc ?? 0))
    cmcBuckets[cmc] = (cmcBuckets[cmc] || 0) + (card.qty || 1)
  }
  const maxCmc   = Math.max(1, ...Object.values(cmcBuckets))
  const cmcTotal = Object.values(cmcBuckets).reduce((s, v) => s + v, 0)

  //  Color identity 
  const colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 }
  let colorlessCount = 0
  for (const card of mainboard) {
    const colors = cardStats[card.name]?.colors || []
    const qty    = card.qty || 1
    if (colors.length === 0) { colorlessCount += qty; continue }
    for (const c of colors) {
      if (colorCounts[c] !== undefined) colorCounts[c] += qty
    }
  }
  const colorEntries = Object.entries(colorCounts).filter(([, v]) => v > 0)
  if (colorlessCount > 0) colorEntries.push(['C', colorlessCount])
  const maxColor = Math.max(1, ...colorEntries.map(([, v]) => v))

  const CMC_LABELS = ['0', '1', '2', '3', '4', '5', '6+']

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '12px', padding: '14px 16px', marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>

        {/* Mana Curve */}
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Mana Curve {cmcTotal > 0 && <span style={{ fontWeight: 400, opacity: .7 }}>({cmcTotal} non-land)</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
            {CMC_LABELS.map((label, i) => {
              const count = cmcBuckets[i] || 0
              const pct   = count / maxCmc
              return (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  {count > 0 && (
                    <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', lineHeight: 1 }}>{count}</div>
                  )}
                  <div style={{
                    width: '100%', borderRadius: '3px 3px 0 0',
                    height: `${Math.max(pct * 48, count > 0 ? 4 : 0)}px`,
                    background: count > 0
                      ? `linear-gradient(180deg, #16a389, #1ec4a6)`
                      : 'var(--bg-secondary)',
                    transition: 'height .3s',
                  }} />
                  <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        {colorEntries.length > 0 && (
          <div style={{ width: '1px', background: 'var(--border)', alignSelf: 'stretch', flexShrink: 0 }} />
        )}

        {/* Color Identity */}
        {colorEntries.length > 0 && (
          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
            <div style={{ fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Color Identity
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {colorEntries.sort((a, b) => b[1] - a[1]).map(([col, count]) => {
                const meta = COLOR_META[col] || COLOR_META.C
                const pct  = count / maxColor
                return (
                  <div key={col} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '.68rem', color: meta.color, width: '14px', textAlign: 'center', flexShrink: 0, fontWeight: 700 }}>{col}</div>
                    <div style={{ flex: 1, height: '10px', borderRadius: '99px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '99px',
                        width: `${pct * 100}%`,
                        background: meta.color,
                        opacity: .85,
                        transition: 'width .4s',
                      }} />
                    </div>
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', width: '20px', textAlign: 'right', flexShrink: 0 }}>{count}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

//  Card row with hover preview 
function CardRow({ card, cardValues, isLast, openCardSearch }) {
  const [previewImg, setPreviewImg] = useState(null)
  const [hoverPos,   setHoverPos]   = useState(null)
  const price = cardValues?.[card.name]

  const handleMouseEnter = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const W = window.innerWidth
    const H = window.innerHeight
    const PW = 210, PH = 295   // preview dimensions (approximate)
    const x = rect.right + 14 + PW < W ? rect.right + 14 : rect.left - PW - 14
    const y = Math.max(8, Math.min(rect.top - 20, H - PH - 8))
    setHoverPos({ x, y })

    if (IMG_CACHE.has(card.name)) {
      setPreviewImg(IMG_CACHE.get(card.name))
      return
    }
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(card.name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const url = data?.image_uris?.normal || data?.card_faces?.[0]?.image_uris?.normal || null
        IMG_CACHE.set(card.name, url)
        setPreviewImg(url)
      })
      .catch(() => IMG_CACHE.set(card.name, null))
  }, [card.name])

  const handleMouseLeave = useCallback(() => {
    setPreviewImg(null)
    setHoverPos(null)
  }, [])

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '3px 0',
          borderBottom: isLast ? 'none' : '1px solid var(--bg-secondary)',
        }}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={() => openCardSearch?.(card.name)}
          onKeyDown={e => e.key === 'Enter' && openCardSearch?.(card.name)}
          style={{ fontSize: '.83rem', color: 'var(--text-primary)', flex: 1, minWidth: 0, cursor: 'pointer', transition: 'color .1s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-teal)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-primary)'}
        >
          {card.name}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexShrink: 0, marginLeft: '8px' }}>
          {price != null && (
            <span style={{ fontSize: '.68rem', color: 'var(--accent-gold)' }}>
              ${(price * card.qty).toFixed(2)}
            </span>
          )}
          <span style={{ fontSize: '.76rem', fontWeight: 700, color: card.qty > 1 ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
            ×{card.qty}
          </span>
        </div>
      </div>

      {hoverPos && previewImg && createPortal(
        <div style={{
          position: 'fixed', left: hoverPos.x, top: hoverPos.y,
          zIndex: 9999, pointerEvents: 'none',
          filter: 'drop-shadow(0 8px 32px rgba(0,0,0,.85))',
          transition: 'opacity .1s',
        }}>
          <img src={previewImg} alt={card.name} style={{ width: 200, borderRadius: 12, display: 'block' }} />
        </div>,
        document.body
      )}
    </>
  )
}

//  Deck section 
function DeckSection({ title, cards, highlight, cardValues, openCardSearch }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${highlight ? 'var(--accent-gold)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: '14px 16px',
    }}>
      <div style={{
        fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        color: highlight ? 'var(--accent-gold)' : 'var(--text-muted)', marginBottom: '10px',
      }}>
        {title}
      </div>
      {cards.map((card, i) => (
        <CardRow key={`${card.name}-${i}`} card={card} cardValues={cardValues} isLast={i === cards.length - 1} openCardSearch={openCardSearch} />
      ))}
    </div>
  )
}

//  Deck detail view 
function DeckDetail({ deck, collection, user, showToast, onBack, onEdit, onDelete, onCopyArena, copied, showModal, onModalClose, onModalSave, editDeck, openCardSearch }) {
  const { main, side } = countCards(deck)
  const isCmdr   = isCommanderFormat(deck.format)
  const fmt      = FORMAT_COLORS[deck.format] || { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' }
  const mainboard = deck.mainboard || []
  const sideboard = deck.sideboard || []

  //  Hand simulator 
  const [showSimulator, setShowSimulator] = useState(false)

  //  Buy deck / Add to collection 
  const [addingToCollection, setAddingToCollection] = useState(false)
  const [addCollProg,        setAddCollProg]        = useState(null)  // {done, total}
  const [showBuyMenu,        setShowBuyMenu]        = useState(false)

  // Flat deduplicated card list from the whole deck (main + side + commander)
  const allDeckCards = useMemo(() => {
    const map = {}
    for (const card of [...mainboard, ...sideboard]) {
      map[card.name] = (map[card.name] || 0) + card.qty
    }
    if (deck.commander) map[deck.commander] = Math.max(map[deck.commander] || 0, 1)
    return Object.entries(map).map(([name, qty]) => ({ name, qty }))
  }, [mainboard, sideboard, deck.commander])

  // "qty CardName" per line — plain text for pasting
  function buildDecklistText() {
    return allDeckCards.map(c => `${c.qty} ${c.name}`).join('\n')
  }

  //  Vendor cart builders 

  // TCGPlayer: copy decklist to clipboard and open mass entry page via Impact affiliate link.
  // The ?u= param deep-links through the affiliate tracker to the mass entry page,
  // setting the tracking cookie so any purchase credits the affiliate account.
  const TCG_MASSENTRY = 'https://partner.tcgplayer.com/c/7200332/1780961/21018'
    + '?u=' + encodeURIComponent('https://www.tcgplayer.com/massentry')
  async function openTCGPlayer() {
    try { await navigator.clipboard.writeText(buildDecklistText()) } catch { /* ok */ }
    window.open(TCG_MASSENTRY, '_blank', 'noopener')
    showToast('✓ Decklist copied — paste it into TCGPlayer Mass Entry!')
    setShowBuyMenu(false)
  }

  // ManaPool: no URL pre-fill supported — copy list to clipboard and land on add-deck page.
  // The ?ref= affiliate cookie is set on landing.
  async function openManaPool() {
    try { await navigator.clipboard.writeText(buildDecklistText()) } catch { /* clipboard blocked */ }
    window.open('https://manapool.com/add-deck?ref=manamint', '_blank', 'noopener')
    showToast('✓ Decklist copied — paste it into ManaPool!')
    setShowBuyMenu(false)
  }

  async function handleAddToCollection() {
    if (addingToCollection) return
    const cards = allDeckCards
    if (cards.length === 0) return
    setAddingToCollection(true)
    setAddCollProg({ done: 0, total: cards.length })

    // Batch-fetch Scryfall data (75 per request)
    const sfMap = {}
    for (let i = 0; i < cards.length; i += 75) {
      const batch = cards.slice(i, i + 75)
      try {
        const res  = await fetch('https://api.scryfall.com/cards/collection', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ identifiers: batch.map(c => ({ name: c.name })) }),
        })
        const json = await res.json()
        for (const card of json.data || []) {
          sfMap[card.name.toLowerCase()] = card
        }
      } catch { /* continue without enrichment for this batch */ }
      if (i + 75 < cards.length) await new Promise(r => setTimeout(r, 100))
    }

    // Build enriched card objects matching the bulkAddCards schema
    const enriched = cards.map(c => {
      const sf = sfMap[c.name.toLowerCase()]
      return {
        name:      c.name,
        qty:       c.qty,
        condition: 'NM',
        setName:   sf?.set_name    || null,
        img:       sf?.image_uris?.small || sf?.card_faces?.[0]?.image_uris?.small || null,
        colors:    sf?.colors      || sf?.card_faces?.[0]?.colors || [],
        price:     sf ? (parseFloat(sf.prices?.usd) || null) : null,
        scryfallId: sf?.id         || null,
      }
    })

    try {
      await bulkAddCards(enriched, user?.id, {
        onProgress: (done, total) => setAddCollProg({ done, total }),
      })
      showToast(`✓ ${enriched.length} card${enriched.length !== 1 ? 's' : ''} added to your collection`)
    } catch (err) {
      showToast(`Failed to add cards: ${err.message}`)
    }
    setAddingToCollection(false)
    setAddCollProg(null)
  }

  //  Budget tracker 
  const [deckValue,   setDeckValue]   = useState(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [fetchProg,   setFetchProg]   = useState(null)

  useEffect(() => {
    setDeckValue(getDeckValueSync(deck, collection || []))
  }, [deck, collection])

  const handleFetchAllPrices = useCallback(async (valueSnapshot) => {
    const dv = valueSnapshot || deckValue
    if (!dv || fetchingAll) return
    setFetchingAll(true)
    setFetchProg({ done: 0, total: dv.unknownCards.length })
    const prices = await fetchUnknownDeckPrices(dv.unknownCards, {
      onProgress: (done, total) => setFetchProg({ done, total }),
    })
    setDeckValue(prev => {
      if (!prev) return prev
      const cardValues = { ...prev.cardValues, ...prices }
      const allCards = [...mainboard, ...sideboard, ...(deck.commander ? [{ name: deck.commander, qty: 1 }] : [])]
      const totalValue = Object.entries(cardValues).reduce((s, [name, p]) => {
        if (p == null) return s
        const card = allCards.find(c => c.name === name)
        return s + (p * (card?.qty || 1))
      }, 0)
      return { ...prev, cardValues, cachedValue: totalValue, unknownCards: [] }
    })
    setFetchingAll(false)
    setFetchProg(null)
  }, [deckValue, fetchingAll, mainboard, sideboard, deck.commander]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch market prices when deck is first opened
  const didAutoFetch = useRef(false)
  useEffect(() => {
    if (deckValue && !didAutoFetch.current && deckValue.unknownCards.length > 0) {
      didAutoFetch.current = true
      handleFetchAllPrices(deckValue)
    }
  }, [deckValue]) // eslint-disable-line react-hooks/exhaustive-deps

  //  Card type grouping + stats (CMC, colors) 
  const [cardTypes,    setCardTypes]    = useState({})
  const [cardStats,    setCardStats]    = useState({})   // { [name]: { cmc, colors } }
  const [typesLoading, setTypesLoading] = useState(true)

  useEffect(() => {
    const allNames = [
      ...mainboard.map(c => c.name),
      ...(deck.commander ? [deck.commander] : []),
    ]
    if (allNames.length === 0) { setTypesLoading(false); return }

    const uniqueNames = [...new Set(allNames)]
    const BATCH = 75
    const promises = []

    for (let i = 0; i < uniqueNames.length; i += BATCH) {
      const batch = uniqueNames.slice(i, i + BATCH)
      promises.push(
        fetch('https://api.scryfall.com/cards/collection', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ identifiers: batch.map(n => ({ name: n })) }),
        })
        .then(r => r.ok ? r.json() : { data: [] })
        .then(({ data = [] }) => {
          const types = {}
          const stats = {}
          for (const card of data) {
            // For DFCs the type_line is "Creature — X // Planeswalker — Y".
            // Use only the front face so the card goes in the right bucket.
            const typeLine = (card.type_line || '').split(' // ')[0]
            types[card.name] = typeLine
            // Also index by front-face name so "Delver of Secrets" resolves
            // even though Scryfall returns the full "Delver of Secrets // Insectile Aberration".
            const frontName = card.name.split(' // ')[0]
            if (frontName !== card.name) types[frontName] = typeLine

            // Store CMC + color identity for mana curve / color charts
            const cardData = { cmc: card.cmc ?? 0, colors: card.color_identity || [] }
            stats[card.name] = cardData
            if (frontName !== card.name) stats[frontName] = cardData

            // Pre-cache the image URL so the hand simulator shows cards immediately
            // without needing individual per-card fetches when the modal opens.
            const imgUrl = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null
            if (imgUrl) {
              if (!IMG_CACHE.has(card.name))  IMG_CACHE.set(card.name, imgUrl)
              if (frontName !== card.name && !IMG_CACHE.has(frontName)) IMG_CACHE.set(frontName, imgUrl)
            }
          }
          return { types, stats }
        })
        .catch(() => ({ types: {}, stats: {} }))
      )
    }

    Promise.all(promises).then(results => {
      setCardTypes(Object.assign({}, ...results.map(r => r.types)))
      setCardStats(Object.assign({}, ...results.map(r => r.stats)))
      setTypesLoading(false)
    })
  }, [deck.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build typed groups for mainboard once types are loaded
  const typeGroups = useMemo(() => {
    if (typesLoading || Object.keys(cardTypes).length === 0) return null
    const buckets = {}
    for (const card of mainboard) {
      const bucket = getTypeBucket(cardTypes[card.name] || '')
      if (!buckets[bucket]) buckets[bucket] = []
      buckets[bucket].push(card)
    }
    return TYPE_ORDER
      .map(t => ({
        ...t,
        cards: buckets[t.key] || [],
        count: (buckets[t.key] || []).reduce((s, c) => s + c.qty, 0),
      }))
      .filter(t => t.cards.length > 0)
  }, [mainboard, cardTypes, typesLoading])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ flexShrink: 0 }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'inline-block', fontSize: '.65rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: '4px', marginBottom: '6px',
            background: fmt.bg, color: fmt.color, textTransform: 'uppercase', letterSpacing: '.5px',
          }}>
            {deck.format}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{deck.name}</h2>
          {isCmdr && deck.commander && (
            <div style={{ fontSize: '.82rem', color: 'var(--accent-gold)', marginTop: '4px' }}>Commander: {deck.commander}</div>
          )}
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {main} cards{side > 0 ? ` · ${side} sideboard` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSimulator(true)} style={{ fontWeight: 700 }}>
             Simulate Hand
          </button>
          <button className={`btn btn-sm ${copied ? 'btn-ghost' : 'btn-ghost'}`} onClick={onCopyArena}>
            {copied ? '✓ Copied!' : ' Copy for Arena'}
          </button>

          {/* Buy deck dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowBuyMenu(v => !v)}
              style={{ color: '#4ade80' }}
            >
               Buy Deck 
            </button>
            {showBuyMenu && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  onClick={() => setShowBuyMenu(false)}
                />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '10px', padding: '6px', zIndex: 50,
                  minWidth: '190px', boxShadow: '0 8px 24px rgba(0,0,0,.5)',
                  display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                  <button
                    onClick={openTCGPlayer}
                    style={{
                      background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.25)',
                      borderRadius: '7px', padding: '8px 12px', cursor: 'pointer',
                      color: '#4ade80', fontWeight: 700, fontSize: '.78rem', textAlign: 'left',
                    }}
                  >
                     Shop on TCGPlayer
                  </button>
                  <button
                    onClick={openManaPool}
                    style={{
                      background: 'rgba(56,189,248,.1)', border: '1px solid rgba(56,189,248,.25)',
                      borderRadius: '7px', padding: '8px 12px', cursor: 'pointer',
                      color: '#38bdf8', fontWeight: 700, fontSize: '.78rem', textAlign: 'left',
                    }}
                  >
                     Shop on ManaPool
                  </button>
                  <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', padding: '4px 8px 2px' }}>
                    TCGPlayer opens pre-filled. ManaPool needs a paste.
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Add to collection */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleAddToCollection}
            disabled={addingToCollection}
            style={{ color: '#16a389' }}
          >
            {addingToCollection
              ? ` Adding… ${addCollProg ? `${addCollProg.done}/${addCollProg.total}` : ''}`
              : ' Add to Collection'}
          </button>

          <button className="btn btn-ghost btn-sm" onClick={onEdit}> Edit</button>
          <button className="btn btn-ghost btn-sm" style={{ color: '#ef5350' }} onClick={onDelete}> Delete</button>
        </div>
      </div>

      {/* Budget tracker */}
      {deckValue && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '12px', padding: '14px 16px', marginBottom: '20px',
          display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>Deck Value</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-gold)' }}>${deckValue.cachedValue.toFixed(2)}</div>
          </div>
          {deckValue.ownedValue > 0 && deckValue.ownedValue !== deckValue.cachedValue && (
            <div>
              <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>You Own</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-teal)' }}>${deckValue.ownedValue.toFixed(2)}</div>
            </div>
          )}
          {deckValue.unknownCards.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{deckValue.unknownCards.length} cards without prices</span>
              <button className="btn btn-ghost btn-sm" onClick={handleFetchAllPrices} disabled={fetchingAll} style={{ fontSize: '.7rem' }}>
                {fetchingAll ? `Fetching ${fetchProg?.done || 0}/${fetchProg?.total || '?'}…` : ' Fetch Market Prices'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Deck stats: mana curve + color identity */}
      {!typesLoading && Object.keys(cardStats).length > 0 && (
        <DeckStatsBar mainboard={mainboard} cardStats={cardStats} cardTypes={cardTypes} />
      )}

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>

        {/* Commander — alignSelf:start so the box stays compact (1-2 cards) instead of
            stretching to match the height of adjacent type sections */}
        {isCmdr && deck.commander && (
          <div style={{ alignSelf: 'start' }}>
            <DeckSection title=" Commander" cards={[{ qty: 1, name: deck.commander }]} highlight cardValues={deckValue?.cardValues} openCardSearch={openCardSearch} />
          </div>
        )}

        {/* Mainboard — typed groups or fallback while loading */}
        {mainboard.length > 0 && (
          typeGroups
            ? typeGroups.map(group => (
                <DeckSection
                  key={group.key}
                  title={`${group.label} (${group.count})`}
                  cards={group.cards}
                  cardValues={deckValue?.cardValues}
                  openCardSearch={openCardSearch}
                />
              ))
            : (
              <DeckSection
                title={
                  typesLoading
                    ? `${isCmdr ? 'Deck' : 'Main Deck'} (${isCmdr ? main - 1 : main}) · grouping…`
                    : `${isCmdr ? 'Deck' : 'Main Deck'} (${isCmdr ? main - 1 : main})`
                }
                cards={mainboard}
                cardValues={deckValue?.cardValues}
                openCardSearch={openCardSearch}
              />
            )
        )}

        {/* Sideboard */}
        {sideboard.length > 0 && (
          <DeckSection title={` Sideboard (${side})`} cards={sideboard} cardValues={deckValue?.cardValues} openCardSearch={openCardSearch} />
        )}
      </div>

      {showModal && (
        <ImportDeckModal
          existingDeck={editDeck}
          onClose={onModalClose}
          onSave={onModalSave}
        />
      )}

      {showSimulator && (
        <HandSimulatorModal deck={deck} cardTypes={cardTypes} onClose={() => setShowSimulator(false)} />
      )}
    </div>
  )
}

//  Card image for the hand simulator 
// Fetches from Scryfall (using the shared IMG_CACHE) and renders a card image.
// On hover, shows a full-size preview via a portal (same pattern as CardRow).
function SimCardImage({ name, width = 90, onClick, dimmed, style }) {
  const cached = IMG_CACHE.has(name) ? IMG_CACHE.get(name) : undefined
  const [img,      setImg]      = useState(cached)
  const [hoverPos, setHoverPos] = useState(null)
  // null in cache = previous fetch failed; treat as uncached so we retry.
  // Only a real URL string counts as "already fetched".
  const fetchedRef = useRef(typeof cached === 'string')

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(card => {
        const url = card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null
        if (url) IMG_CACHE.set(name, url) // only cache real URLs — failures stay retryable
        setImg(url)
      })
      .catch(() => {}) // don't cache errors; next mount will retry
  }, [name])

  const height = Math.round(width * 1.4)

  function handleMouseEnter(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const PW = 220, PH = 308
    const W  = window.innerWidth, H = window.innerHeight
    const x  = rect.right + 12 + PW < W ? rect.right + 12 : rect.left - PW - 12
    const y  = Math.max(8, Math.min(rect.top - 20, H - PH - 8))
    setHoverPos({ x, y })
  }

  return (
    <>
      <div
        onClick={onClick}
        title={name}
        style={{
          width, height, borderRadius: 7, overflow: 'hidden', flexShrink: 0,
          background: '#1e2a3a', border: '1px solid rgba(255,255,255,.08)',
          cursor: onClick ? 'pointer' : 'default',
          opacity: dimmed ? 0.45 : 1,
          transition: 'transform .12s, box-shadow .12s, opacity .15s',
          ...style,
        }}
        onMouseEnter={e => {
          handleMouseEnter(e)
          if (onClick) { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.6)' }
        }}
        onMouseLeave={e => {
          setHoverPos(null)
          if (onClick) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }
        }}
      >
        {img
          ? <img src={img} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
          : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '6px', textAlign: 'center',
            }}>
              <span style={{ fontSize: '.55rem', color: '#94a3b8', lineHeight: 1.4 }}>{name}</span>
            </div>
          )
        }
      </div>

      {hoverPos && img && createPortal(
        <div style={{
          position: 'fixed', left: hoverPos.x, top: hoverPos.y,
          zIndex: 9999, pointerEvents: 'none',
          filter: 'drop-shadow(0 12px 40px rgba(0,0,0,.9))',
        }}>
          <img src={img} alt={name} style={{ width: 220, borderRadius: 14, display: 'block' }} />
        </div>,
        document.body
      )}
    </>
  )
}

//  Battlefield card (solitaire) 
// Fixed 116×116 slot so layout doesn't shift when rotating tapped/untapped.
function BattlefieldCard({ card, onTap, onDiscard, onReturn, onDragStart, onDragEnd }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ position: 'relative', width: 116, height: 116, flexShrink: 0, cursor: 'grab' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Rotating card */}
      <div
        onClick={onTap}
        title={card.tapped ? `${card.name} — click to untap` : `${card.name} — click to tap`}
        style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(-50%, -50%) rotate(${card.tapped ? 90 : 0}deg)`,
          transition: 'transform .22s ease',
          cursor: 'grab',
        }}
      >
        <SimCardImage name={card.name} width={74} />
      </div>

      {/* Tapped label */}
      {card.tapped && (
        <div style={{
          position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)',
          fontSize: '.48rem', color: 'rgba(248,113,113,0.75)', fontWeight: 700,
          letterSpacing: '.6px', textTransform: 'uppercase', pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>TAPPED</div>
      )}

      {/* Action buttons — dim when not hovered, bright on hover */}
      <div style={{
        position: 'absolute', top: 0, right: 0,
        display: 'flex', flexDirection: 'column', gap: 3,
        opacity: hovered ? 1 : 0.18,
        transition: 'opacity .15s',
        zIndex: 5,
      }}>
        <button
          onClick={e => { e.stopPropagation(); onReturn() }}
          title="Return to hand"
          style={{
            width: 20, height: 20, borderRadius: '50%', border: 'none',
            background: '#6366f1', color: '#fff', fontSize: '.68rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >↩</button>
        <button
          onClick={e => { e.stopPropagation(); onDiscard() }}
          title="Send to graveyard"
          style={{
            width: 20, height: 20, borderRadius: '50%', border: 'none',
            background: '#ef4444', color: '#fff', fontSize: '.7rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >✕</button>
      </div>
    </div>
  )
}

//  Hand simulator modal 
function HandSimulatorModal({ deck, cardTypes = {}, onClose }) {
  const allCards = useMemo(() => {
    const cards = []
    let id = 0
    for (const card of (deck.mainboard || [])) {
      for (let i = 0; i < (card.qty || 1); i++) {
        cards.push({ name: card.name, _id: id++ })
      }
    }
    return cards
  }, [deck])

  function fisherYatesShuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const [mode,          setMode]          = useState('hand')
  const [library,       setLibrary]       = useState([])
  const [hand,          setHand]          = useState([])
  const [battlefield,   setBattlefield]   = useState([])  // { _id, name, tapped, zone, x, y }
  const [graveyard,     setGraveyard]     = useState([])
  const [mulliganCount, setMulliganCount] = useState(0)
  const [turn,          setTurn]          = useState(1)
  const [dragSource,    setDragSource]    = useState(null) // { zone, id }
  const [dragOverZone,  setDragOverZone]  = useState(null)
  const dragOffsetRef   = useRef({ x: 37, y: 50 }) // cursor offset within card on dragStart

  // Determines if a card is a land based on the type data fetched by DeckDetail
  function isLandCard(name) {
    return /\bLand\b/.test(cardTypes[name] || '')
  }

  // Auto-assign a battlefield zone based on card type
  function getAutoZone(name) {
    const t = (cardTypes[name] || '').toLowerCase()
    if (t.includes('land'))     return 'lands'
    if (t.includes('creature')) return 'creatures'
    return 'other' // instants, sorceries, enchantments, artifacts, planeswalkers
  }

  // Auto-position: cascade from top-left within the zone
  function getAutoPos(zone, currentBattlefield) {
    const n = currentBattlefield.filter(c => c.zone === zone).length
    return { x: 10 + (n % 7) * 82, y: 10 + Math.floor(n / 7) * 92 }
  }

  useEffect(() => {
    const shuffled = fisherYatesShuffle(allCards)
    setHand(shuffled.slice(0, 7))
    setLibrary(shuffled.slice(7))
    setGraveyard([])
    setBattlefield([])
    setMulliganCount(0)
    setTurn(1)
  }, [allCards])

  function fullReset() {
    const shuffled = fisherYatesShuffle(allCards)
    setHand(shuffled.slice(0, 7))
    setLibrary(shuffled.slice(7))
    setGraveyard([])
    setBattlefield([])
    setMulliganCount(0)
    setTurn(1)
  }

  function mulligan() {
    const newCount  = mulliganCount + 1
    const keepCount = Math.max(1, 7 - newCount)
    const shuffled  = fisherYatesShuffle(allCards)
    setHand(shuffled.slice(0, keepCount))
    setLibrary(shuffled.slice(keepCount))
    setGraveyard([])
    setBattlefield([])
    setMulliganCount(newCount)
    setTurn(1)
  }

  function drawOne() {
    if (library.length === 0) return
    setHand(prev => [...prev, library[0]])
    setLibrary(prev => prev.slice(1))
  }

  // Next turn: untap all permanents → draw 1 → advance turn counter
  function nextTurn() {
    setBattlefield(prev => prev.map(c => ({ ...c, tapped: false })))
    if (library.length > 0) {
      setHand(prev => [...prev, library[0]])
      setLibrary(prev => prev.slice(1))
    }
    setTurn(t => t + 1)
  }

  // Play a hand card to the battlefield (drag-based — zone + position supplied by caller)
  function playCard(id, zone, x, y) {
    const card = hand.find(c => c._id === id)
    if (!card) return
    const targetZone = zone || getAutoZone(card.name)
    setBattlefield(prev => {
      const pos = (x != null && y != null) ? { x, y } : getAutoPos(targetZone, prev)
      return [...prev, { ...card, tapped: false, zone: targetZone, x: pos.x, y: pos.y }]
    })
    setHand(prev => prev.filter(c => c._id !== id))
  }

  function toggleTap(id) {
    setBattlefield(prev => prev.map(c => c._id === id ? { ...c, tapped: !c.tapped } : c))
  }

  function discardFromField(id) {
    const card = battlefield.find(c => c._id === id)
    if (!card) return
    setBattlefield(prev => prev.filter(c => c._id !== id))
    setGraveyard(prev => [card, ...prev])
  }

  function returnToHand(id) {
    const card = battlefield.find(c => c._id === id)
    if (!card) return
    setBattlefield(prev => prev.filter(c => c._id !== id))
    setHand(prev => [...prev, card])
  }

  //  Drag and drop
  function handleDragStart(e, srcZone, id) {
    // Capture where within the card the user grabbed it
    const rect = e.currentTarget.getBoundingClientRect()
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
    setDragSource({ zone: srcZone, id })
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e, zone) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverZone(zone)
  }

  function handleDrop(e, targetZone) {
    e.preventDefault()
    setDragOverZone(null)
    if (!dragSource) return
    const { zone: srcZone, id } = dragSource
    setDragSource(null)

    // Compute free position within the zone container
    const containerRect = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, e.clientX - containerRect.left - dragOffsetRef.current.x)
    const y = Math.max(0, e.clientY - containerRect.top  - dragOffsetRef.current.y)

    let card = null
    if (srcZone === 'hand')            card = hand.find(c => c._id === id)
    else if (srcZone === 'battlefield') card = battlefield.find(c => c._id === id)
    else if (srcZone === 'graveyard')   card = graveyard.find(c => c._id === id)
    if (!card) return

    // Remove from source zone
    if (srcZone === 'hand')            setHand(prev => prev.filter(c => c._id !== id))
    else if (srcZone === 'battlefield') setBattlefield(prev => prev.filter(c => c._id !== id))
    else if (srcZone === 'graveyard')   setGraveyard(prev => prev.filter(c => c._id !== id))

    // Add to target zone
    const bfZones = ['creatures', 'lands', 'other']
    if (bfZones.includes(targetZone)) {
      // Dropping onto battlefield zone — position freely
      setBattlefield(prev => [...prev, { ...card, tapped: false, zone: targetZone, x, y }])
    } else if (targetZone === 'hand') {
      setHand(prev => [...prev, card])
    } else if (targetZone === 'graveyard') {
      setGraveyard(prev => [card, ...prev])
    }
  }

  function handleDragEnd() {
    setDragSource(null)
    setDragOverZone(null)
  }

  const isCmdr = isCommanderFormat(deck.format)

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
        zIndex: 700,
      }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: mode === 'solitaire' ? 'min(1020px, 99vw)' : 'min(780px, 97vw)',
        height: mode === 'solitaire' ? '90vh' : 'auto',
        maxHeight: '94vh',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 701,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 28px 70px rgba(0,0,0,.85)',
        overflow: 'hidden',
      }}>

        {/*  Header  */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.3rem' }}></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '.95rem' }}>Hand Simulator</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
          </div>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 2, gap: 2, flexShrink: 0 }}>
            {[['hand', ' Hand'], ['solitaire', ' Solitaire']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); fullReset() }} style={{
                padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: mode === m ? 700 : 400, fontSize: '.73rem', transition: 'all .15s',
              }}>{l}</button>
            ))}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.1rem', padding: '4px 8px', flexShrink: 0,
          }}>✕</button>
        </div>

        {/*  Stats bar  */}
        <div style={{
          display: 'flex', gap: 18, padding: '8px 18px',
          background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
          flexShrink: 0, flexWrap: 'wrap', alignItems: 'center',
        }}>
          {[
            ['', 'Library',    library.length,     library.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)'],
            ['',  'Hand',       hand.length,        'var(--text-primary)'],
            ...(mode === 'solitaire' ? [['', 'Field', battlefield.length, battlefield.length > 0 ? '#4ade80' : 'var(--text-muted)']] : []),
            ['',  'Graveyard',  graveyard.length,   graveyard.length > 0 ? '#f87171' : 'var(--text-muted)'],
          ].map(([icon, label, count, color]) => (
            <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem' }}>{icon}</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{label}:</span>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color }}>{count}</span>
            </div>
          ))}
          {mode === 'solitaire' && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem' }}></span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Turn:</span>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{turn}</span>
            </div>
          )}
          {isCmdr && deck.commander && (
            <div style={{ marginLeft: 'auto', fontSize: '.7rem', color: 'var(--accent-gold)', display: 'flex', gap: 4 }}>
              <span></span><span>{deck.commander}</span>
            </div>
          )}
        </div>

        {/*  SOLITAIRE LAYOUT — 3 named zones + freeform drag positioning  */}
        {mode === 'solitaire' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', padding: '8px 12px 0' }}>

            {/* ── Battlefield: 3 stacked named zones ─────────────────── */}
            {[
              { id: 'other',     label: '✦ Enchantments · Artifacts · Planeswalkers · Instants', flex: 2, borderColor: 'rgba(168,85,247,', bg: 'rgba(88,28,135,' },
              { id: 'creatures', label: '⚔ Creatures',  flex: 3, borderColor: 'rgba(74,222,128,',  bg: 'rgba(5,46,22,'  },
              { id: 'lands',     label: '🌲 Lands',      flex: 2, borderColor: 'rgba(251,191,36,',  bg: 'rgba(66,32,6,'  },
            ].map((zone, zi) => {
              const isOver  = dragOverZone === zone.id
              const zCards  = battlefield.filter(c => c.zone === zone.id)
              return (
                <div
                  key={zone.id}
                  onDragOver={e => handleDragOver(e, zone.id)}
                  onDrop={e => handleDrop(e, zone.id)}
                  style={{
                    flex: zone.flex, minHeight: 0, position: 'relative',
                    background: isOver ? `${zone.bg}0.35)` : `${zone.bg}0.22)`,
                    border: `1.5px ${isOver ? 'dashed' : 'solid'} ${zone.borderColor}${isOver ? '0.6)' : '0.25)'}`,
                    borderRadius: 10,
                    marginBottom: zi < 2 ? 5 : 0,
                    transition: 'background .15s, border-color .15s',
                    overflow: 'hidden',
                  }}
                >
                  {/* Zone label */}
                  <div style={{
                    position: 'absolute', top: 5, left: 10,
                    fontSize: '.54rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '1px', color: `${zone.borderColor}0.45)`,
                    pointerEvents: 'none', zIndex: 0,
                  }}>{zone.label}</div>

                  {/* Empty hint */}
                  {zCards.length === 0 && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: `${zone.borderColor}0.18)`,
                      fontSize: '.7rem', pointerEvents: 'none',
                    }}>drag here</div>
                  )}

                  {/* Freely positioned cards — stacking supported */}
                  {zCards.map(card => (
                    <div
                      key={card._id}
                      style={{
                        position: 'absolute',
                        left: card.x, top: card.y,
                        zIndex: 2,
                      }}
                    >
                      <BattlefieldCard
                        card={card}
                        onTap={() => toggleTap(card._id)}
                        onDiscard={() => discardFromField(card._id)}
                        onReturn={() => returnToHand(card._id)}
                        onDragStart={e => handleDragStart(e, 'battlefield', card._id)}
                        onDragEnd={handleDragEnd}
                      />
                    </div>
                  ))}
                </div>
              )
            })}

            {/* ── Bottom strip: Hand + Graveyard ─────────────────────── */}
            <div style={{ display: 'flex', gap: 8, padding: '6px 0 8px', flexShrink: 0 }}>

              {/* Hand */}
              <div
                onDragOver={e => handleDragOver(e, 'hand')}
                onDrop={e => handleDrop(e, 'hand')}
                style={{
                  flex: 1, minWidth: 0,
                  background: dragOverZone === 'hand' ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                  border: `1.5px ${dragOverZone === 'hand' ? 'dashed #818cf8' : 'solid var(--border)'}`,
                  borderRadius: 10, padding: '7px 10px',
                  transition: 'background .15s, border-color .15s',
                }}
              >
                <div style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 5 }}>
                  ✋ Hand ({hand.length})
                  {hand.length > 0 && <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: 6, opacity: .65 }}>drag to a zone to play · drag to GY to discard</span>}
                </div>
                {hand.length === 0 ? (
                  <div style={{ height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '.75rem' }}>
                    {library.length === 0 ? 'Library empty' : 'No cards — hit Next Turn to draw'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 3 }}>
                    {hand.map(card => (
                      <div key={card._id} draggable
                        onDragStart={e => handleDragStart(e, 'hand', card._id)}
                        onDragEnd={handleDragEnd}
                        style={{ flexShrink: 0, cursor: 'grab' }}
                        title="Drag to a battlefield zone to play · drag to GY to discard"
                      >
                        <SimCardImage name={card.name} width={78} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Graveyard */}
              <div
                onDragOver={e => handleDragOver(e, 'graveyard')}
                onDrop={e => handleDrop(e, 'graveyard')}
                style={{
                  width: 92, flexShrink: 0,
                  background: dragOverZone === 'graveyard' ? 'rgba(239,68,68,0.12)' : 'var(--bg-secondary)',
                  border: `1.5px ${dragOverZone === 'graveyard' ? 'dashed #f87171' : 'solid var(--border)'}`,
                  borderRadius: 10, padding: '7px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  transition: 'background .15s, border-color .15s',
                }}
              >
                <div style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 5, textAlign: 'center' }}>
                  💀 GY ({graveyard.length})
                </div>
                {graveyard.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(248,113,113,0.22)', fontSize: '1.6rem' }}>☠</div>
                ) : (
                  <div
                    draggable
                    onDragStart={e => handleDragStart(e, 'graveyard', graveyard[0]._id)}
                    onDragEnd={handleDragEnd}
                    style={{ position: 'relative', width: 70, cursor: 'grab' }}
                    title="Drag to return a card from graveyard"
                  >
                    <SimCardImage name={graveyard[0].name} width={70} dimmed />
                    {graveyard.length > 1 && (
                      <div style={{
                        position: 'absolute', top: -7, right: -7,
                        background: '#ef4444', color: '#fff', borderRadius: '50%',
                        width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '.65rem', fontWeight: 800,
                      }}>{graveyard.length}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/*  HAND MODE LAYOUT  */}
        {mode === 'hand' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', minHeight: 0 }}>
            <div style={{
              fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 10,
            }}>
              {mulliganCount > 0
                ? `Hand (${hand.length}) — ${mulliganCount} mulligan${mulliganCount > 1 ? 's' : ''}`
                : `Hand (${hand.length})`}
            </div>
            {hand.length === 0 ? (
              <div style={{
                height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: '.85rem', background: 'var(--bg-secondary)',
                borderRadius: 10, border: '1px dashed var(--border)',
              }}>
                {library.length === 0 ? ' Library is empty' : 'Hand is empty — draw a card'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 6 }}>
                {hand.map(card => (
                  <SimCardImage key={card._id} name={card.name} width={94} />
                ))}
              </div>
            )}
          </div>
        )}

        {/*  Action bar  */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 18px',
          borderTop: '1px solid var(--border)', flexShrink: 0,
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          {mode === 'hand' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={mulligan}>
                 Mulligan {mulliganCount > 0 ? `(keep ${Math.max(1, 7 - mulliganCount)})` : ''}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={fullReset}>↺ New 7</button>
              <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />
              <button className="btn btn-primary btn-sm" onClick={drawOne} disabled={library.length === 0}>
                + Draw 1 {library.length > 0 ? `(${library.length} left)` : '(empty)'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={nextTurn} style={{ fontWeight: 700 }}>
                ⟳ Next Turn → T{turn + 1}{library.length === 0 ? ' (no draw)' : ''}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setBattlefield(prev => prev.map(c => ({ ...c, tapped: false })))}>
                Untap All
              </button>
              <button className="btn btn-ghost btn-sm" onClick={fullReset}>↺ Restart</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                click = tap · hover for actions
              </span>
            </>
          )}
        </div>

      </div>
    </>
  )
}
