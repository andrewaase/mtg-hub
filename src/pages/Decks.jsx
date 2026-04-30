import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getDecks, saveDeck, deleteDeck } from '../lib/db'
import { toArenaFormat, countCards, isCommanderFormat, FORMAT_COLORS } from '../lib/deckUtils'
import { getDeckValueSync, fetchUnknownDeckPrices } from '../lib/pricing'
import ImportDeckModal from '../modals/ImportDeckModal'

const FORMAT_ALL = 'All'

// ── Card type grouping ────────────────────────────────────────────────────────
const TYPE_ORDER = [
  { key: 'Creature',     label: '🦎 Creatures',    test: t => /\bCreature\b/.test(t) },
  { key: 'Planeswalker', label: '✨ Planeswalkers', test: t => /\bPlaneswalker\b/.test(t) },
  { key: 'Battle',       label: '⚔️ Battles',       test: t => /\bBattle\b/.test(t) },
  { key: 'Instant',      label: '⚡ Instants',      test: t => /\bInstant\b/.test(t) },
  { key: 'Sorcery',      label: '🌊 Sorceries',     test: t => /\bSorcery\b/.test(t) },
  { key: 'Enchantment',  label: '🔮 Enchantments',  test: t => /\bEnchantment\b/.test(t) && !/\bCreature\b/.test(t) },
  { key: 'Artifact',     label: '⚙️ Artifacts',     test: t => /\bArtifact\b/.test(t) && !/\bCreature\b/.test(t) },
  { key: 'Land',         label: '🌍 Lands',         test: t => /\bLand\b/.test(t) },
  { key: 'Other',        label: '❓ Other',          test: () => true },
]

function getTypeBucket(typeLine) {
  for (const g of TYPE_ORDER) {
    if (g.test(typeLine || '')) return g.key
  }
  return 'Other'
}

// Module-level card image cache (survives re-renders)
const IMG_CACHE = new Map()

// ── Main Decks page ───────────────────────────────────────────────────────────
export default function Decks({ user, collection, showToast, setDeckModalOpen, openCardSearch }) {
  const [decks, setDecks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [editDeck, setEditDeck]     = useState(null)
  const [formatFilter, setFormatFilter] = useState(FORMAT_ALL)
  const [activeTab, setActiveTab]   = useState('my')
  const [copied, setCopied]         = useState(false)

  useEffect(() => {
    getDecks(user?.id).then(d => { setDecks(d); setLoading(false) })
  }, [user])

  // Block sidebar navigation while deck modal is open
  useEffect(() => {
    setDeckModalOpen?.(showImport)
    return () => setDeckModalOpen?.(false)
  }, [showImport, setDeckModalOpen])

  // ── CRUD ──────────────────────────────────────────────────────────────────
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
      showToast('Copied to clipboard — paste into MTG Arena ✓')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      showToast('Copy failed — try selecting the text manually')
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const formats  = [FORMAT_ALL, ...Array.from(new Set(decks.map(d => d.format))).sort()]
  const filtered = formatFilter === FORMAT_ALL ? decks : decks.filter(d => d.format === formatFilter)

  // ── Detail view ───────────────────────────────────────────────────────────
  if (selected) {
    return (
      <DeckDetail
        deck={selected}
        collection={collection}
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

  // ── Group decks ────────────────────────────────────────────────────────────
  const grouped = {}
  filtered.forEach(deck => {
    const group = deck.group || 'My Decks'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(deck)
  })

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        {[['my', '🃏 Decks'], ['explore', '🔍 Explore']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '.88rem', fontWeight: 600,
            color: activeTab === key ? 'var(--accent-teal)' : 'var(--text-muted)',
            borderBottom: activeTab === key ? '2px solid var(--accent-teal)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'color .15s',
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {activeTab === 'my' && (
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'center', marginRight: '16px', fontSize: '.78rem' }}
            onClick={() => { setEditDeck(null); setShowImport(true) }}>+ New</button>
        )}
      </div>

      {activeTab === 'explore' ? (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">🔍</div>
          <p>Browse popular decks from the community.<br />Coming soon — check Meta Tracker for now.</p>
        </div>
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
              <div className="empty-icon">🃏</div>
              <p>No decks yet.<br />Import a decklist to get started.</p>
              <button className="btn btn-primary" onClick={() => setShowImport(true)} style={{ marginTop: '16px' }}>
                + Import Deck
              </button>
            </div>
          )}

          {!user && decks.length > 0 && (
            <div style={{ background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '.8rem', color: '#fbbf24' }}>
              ⚠️ Sign in to save decks to your profile — decks stored locally will be lost on refresh.
            </div>
          )}

          {Object.entries(grouped).map(([group, groupDecks]) => (
            <div key={group} style={{ padding: '0 16px' }}>
              {Object.keys(grouped).length > 1 && (
                <div className="deck-group-label">🗂 {group}</div>
              )}
              <div className="deck-art-grid">
                {groupDecks.map(deck => (
                  <DeckArtTile
                    key={deck.id}
                    deck={deck}
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
    </div>
  )
}

// ── Deck art tile ─────────────────────────────────────────────────────────────
function DeckArtTile({ deck, onClick, onEdit, onDelete }) {
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
  const isCmdr = isCommanderFormat(deck.format)

  return (
    <div className="deck-art-tile" onClick={onClick}>
      {artUrl
        ? <img src={artUrl} alt={deck.name} className="deck-art-tile-img" />
        : <div className="deck-art-tile-placeholder" style={{ background: `linear-gradient(135deg, ${FORMAT_COLORS[deck.format]?.bg || '#1a1a1c'}, #0d0d0f)` }}>🃏</div>
      }
      <div className="deck-art-tile-overlay" />
      <div className="deck-art-tile-body">
        <div className="deck-art-tile-name">{deck.name}</div>
        <div className="deck-art-tile-format">
          {deck.format}{isCmdr && deck.commander ? ` · ${deck.commander}` : ''} · {main} cards
        </div>
      </div>
      <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}
           onClick={e => e.stopPropagation()}>
        <button onClick={onEdit}   style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '.68rem', color: '#fff', cursor: 'pointer' }}>✏️</button>
        <button onClick={onDelete} style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '.68rem', color: '#f87171', cursor: 'pointer' }}>🗑</button>
      </div>
    </div>
  )
}

// ── Card row with hover preview ───────────────────────────────────────────────
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

// ── Deck section ──────────────────────────────────────────────────────────────
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

// ── Deck detail view ──────────────────────────────────────────────────────────
function DeckDetail({ deck, collection, onBack, onEdit, onDelete, onCopyArena, copied, showModal, onModalClose, onModalSave, editDeck, openCardSearch }) {
  const { main, side } = countCards(deck)
  const isCmdr   = isCommanderFormat(deck.format)
  const fmt      = FORMAT_COLORS[deck.format] || { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' }
  const mainboard = deck.mainboard || []
  const sideboard = deck.sideboard || []

  // ── Budget tracker ────────────────────────────────────────────────────────
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

  // ── Card type grouping ────────────────────────────────────────────────────
  const [cardTypes,    setCardTypes]    = useState({})
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
          for (const card of data) types[card.name] = card.type_line || ''
          return types
        })
        .catch(() => ({}))
      )
    }

    Promise.all(promises).then(results => {
      setCardTypes(Object.assign({}, ...results))
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
          <button className={`btn btn-sm ${copied ? 'btn-ghost' : 'btn-primary'}`} onClick={onCopyArena} style={{ fontWeight: 700 }}>
            {copied ? '✓ Copied!' : '📋 Copy for Arena'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>✏️ Edit</button>
          <button className="btn btn-ghost btn-sm" style={{ color: '#ef5350' }} onClick={onDelete}>🗑️ Delete</button>
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
                {fetchingAll ? `Fetching ${fetchProg?.done || 0}/${fetchProg?.total || '?'}…` : '🔄 Fetch Market Prices'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>

        {/* Commander */}
        {isCmdr && deck.commander && (
          <DeckSection title="⭐ Commander" cards={[{ qty: 1, name: deck.commander }]} highlight cardValues={deckValue?.cardValues} openCardSearch={openCardSearch} />
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
          <DeckSection title={`🔄 Sideboard (${side})`} cards={sideboard} cardValues={deckValue?.cardValues} openCardSearch={openCardSearch} />
        )}
      </div>

      {showModal && (
        <ImportDeckModal
          existingDeck={editDeck}
          onClose={onModalClose}
          onSave={onModalSave}
        />
      )}
    </div>
  )
}
