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
      showToast('Copied to clipboard. Paste into MTG Arena ✓')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      showToast('Copy failed. Try selecting the text manually')
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
          <p>Browse popular decks from the community.<br />Coming soon. Check Meta Tracker for now.</p>
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
              ⚠️ Sign in to save decks to your profile. Decks stored locally will be lost on refresh.
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
                    collection={collection}
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
function DeckArtTile({ deck, collection, onClick, onEdit, onDelete }) {
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
  const deckVal = useMemo(() => getDeckValueSync(deck, collection || []), [deck, collection])
  const price   = deckVal.cachedValue > 0
    ? deckVal.cachedValue >= 1000
      ? `$${(deckVal.cachedValue / 1000).toFixed(1)}k`
      : `$${deckVal.cachedValue.toFixed(2)}`
    : null

  return (
    <div className="deck-art-tile" onClick={onClick}>
      {artUrl
        ? <img src={artUrl} alt={deck.name} className="deck-art-tile-img" />
        : <div className="deck-art-tile-placeholder" style={{ background: `linear-gradient(135deg, ${FORMAT_COLORS[deck.format]?.bg || '#1a1a1c'}, #0d0d0f)` }}>🃏</div>
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

  // ── Hand simulator ────────────────────────────────────────────────────────
  const [showSimulator, setShowSimulator] = useState(false)

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
          for (const card of data) {
            // For DFCs the type_line is "Creature — X // Planeswalker — Y".
            // Use only the front face so the card goes in the right bucket.
            const typeLine = (card.type_line || '').split(' // ')[0]
            types[card.name] = typeLine
            // Also index by front-face name so "Delver of Secrets" resolves
            // even though Scryfall returns the full "Delver of Secrets // Insectile Aberration".
            const frontName = card.name.split(' // ')[0]
            if (frontName !== card.name) types[frontName] = typeLine
          }
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
          <button className="btn btn-primary btn-sm" onClick={() => setShowSimulator(true)} style={{ fontWeight: 700 }}>
            🎲 Simulate Hand
          </button>
          <button className={`btn btn-sm ${copied ? 'btn-ghost' : 'btn-ghost'}`} onClick={onCopyArena}>
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

        {/* Commander — alignSelf:start so the box stays compact (1-2 cards) instead of
            stretching to match the height of adjacent type sections */}
        {isCmdr && deck.commander && (
          <div style={{ alignSelf: 'start' }}>
            <DeckSection title="⭐ Commander" cards={[{ qty: 1, name: deck.commander }]} highlight cardValues={deckValue?.cardValues} openCardSearch={openCardSearch} />
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

      {showSimulator && (
        <HandSimulatorModal deck={deck} onClose={() => setShowSimulator(false)} />
      )}
    </div>
  )
}

// ── Card image for the hand simulator ─────────────────────────────────────────
// Fetches from Scryfall (using the shared IMG_CACHE) and renders a card image.
// On hover, shows a full-size preview via a portal (same pattern as CardRow).
function SimCardImage({ name, width = 90, onClick, dimmed, style }) {
  const cached = IMG_CACHE.has(name) ? IMG_CACHE.get(name) : undefined
  const [img,      setImg]      = useState(cached)
  const [hoverPos, setHoverPos] = useState(null)
  const fetchedRef = useRef(cached !== undefined)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(card => {
        const url = card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null
        IMG_CACHE.set(name, url)
        setImg(url)
      })
      .catch(() => { IMG_CACHE.set(name, null) })
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

// ── Battlefield card (solitaire) ──────────────────────────────────────────────
// Fixed 116×116 slot so layout doesn't shift when rotating tapped/untapped.
function BattlefieldCard({ card, onTap, onDiscard, onReturn, onDragStart, onDragEnd }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{ position: 'relative', width: 116, height: 116, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Rotating card */}
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
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

// ── Hand simulator modal ───────────────────────────────────────────────────────
function HandSimulatorModal({ deck, onClose }) {
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
  const [battlefield,   setBattlefield]   = useState([])  // { _id, name, tapped }
  const [graveyard,     setGraveyard]     = useState([])
  const [mulliganCount, setMulliganCount] = useState(0)
  const [turn,          setTurn]          = useState(1)
  const [dragSource,    setDragSource]    = useState(null) // { zone, id }
  const [dragOverZone,  setDragOverZone]  = useState(null)

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

  // Play a hand card to the battlefield
  function playCard(id) {
    const card = hand.find(c => c._id === id)
    if (!card) return
    setHand(prev => prev.filter(c => c._id !== id))
    setBattlefield(prev => [...prev, { ...card, tapped: false }])
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

  // ── Drag and drop ──────────────────────────────────────────────────────────
  function handleDragStart(e, zone, id) {
    setDragSource({ zone, id })
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
    if (srcZone === targetZone) return

    let card = null
    if (srcZone === 'hand')        card = hand.find(c => c._id === id)
    else if (srcZone === 'battlefield') card = battlefield.find(c => c._id === id)
    else if (srcZone === 'graveyard')   card = graveyard.find(c => c._id === id)
    if (!card) return

    if (srcZone === 'hand')        setHand(prev => prev.filter(c => c._id !== id))
    else if (srcZone === 'battlefield') setBattlefield(prev => prev.filter(c => c._id !== id))
    else if (srcZone === 'graveyard')   setGraveyard(prev => prev.filter(c => c._id !== id))

    if (targetZone === 'battlefield') setBattlefield(prev => [...prev, { ...card, tapped: false }])
    else if (targetZone === 'hand')   setHand(prev => [...prev, card])
    else if (targetZone === 'graveyard') setGraveyard(prev => [card, ...prev])
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
        zIndex: 700, backdropFilter: 'blur(6px)',
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

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <span style={{ fontSize: '1.3rem' }}>🎲</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '.95rem' }}>Hand Simulator</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deck.name}</div>
          </div>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 2, gap: 2, flexShrink: 0 }}>
            {[['hand', '🖐 Hand'], ['solitaire', '♟ Solitaire']].map(([m, l]) => (
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

        {/* ── Stats bar ── */}
        <div style={{
          display: 'flex', gap: 18, padding: '8px 18px',
          background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
          flexShrink: 0, flexWrap: 'wrap', alignItems: 'center',
        }}>
          {[
            ['📚', 'Library',    library.length,     library.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)'],
            ['🖐',  'Hand',       hand.length,        'var(--text-primary)'],
            ...(mode === 'solitaire' ? [['🟩', 'Field', battlefield.length, battlefield.length > 0 ? '#4ade80' : 'var(--text-muted)']] : []),
            ['🗑',  'Graveyard',  graveyard.length,   graveyard.length > 0 ? '#f87171' : 'var(--text-muted)'],
          ].map(([icon, label, count, color]) => (
            <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem' }}>{icon}</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{label}:</span>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color }}>{count}</span>
            </div>
          ))}
          {mode === 'solitaire' && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem' }}>🕐</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Turn:</span>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{turn}</span>
            </div>
          )}
          {isCmdr && deck.commander && (
            <div style={{ marginLeft: 'auto', fontSize: '.7rem', color: 'var(--accent-gold)', display: 'flex', gap: 4 }}>
              <span>⭐</span><span>{deck.commander}</span>
            </div>
          )}
        </div>

        {/* ════════════════ SOLITAIRE LAYOUT ════════════════ */}
        {mode === 'solitaire' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

            {/* ── Battlefield drop zone ── */}
            <div
              onDragOver={e => handleDragOver(e, 'battlefield')}
              onDrop={e => handleDrop(e, 'battlefield')}
              style={{
                flex: 1, minHeight: 0,
                background: dragOverZone === 'battlefield'
                  ? 'rgba(0,110,45,0.45)'
                  : 'rgba(0,45,20,0.38)',
                border: `2px ${dragOverZone === 'battlefield'
                  ? 'dashed rgba(74,222,128,0.75)'
                  : 'solid rgba(0,70,25,0.55)'}`,
                borderRadius: 12, margin: '10px 14px 6px',
                padding: '28px 12px 10px',
                overflowY: 'auto',
                transition: 'background .15s, border-color .15s',
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 7, left: 13,
                fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '1.2px', color: 'rgba(100,220,120,0.5)',
                pointerEvents: 'none',
              }}>🟩 Battlefield</div>

              {battlefield.length === 0 ? (
                <div style={{
                  height: '100%', minHeight: 110,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, pointerEvents: 'none',
                  color: 'rgba(100,200,120,0.28)',
                }}>
                  <div style={{ fontSize: '2.2rem' }}>🃏</div>
                  <div style={{ fontSize: '.8rem' }}>Drag cards here — or click a hand card to play</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignContent: 'flex-start' }}>
                  {battlefield.map(card => (
                    <BattlefieldCard
                      key={card._id}
                      card={card}
                      onTap={() => toggleTap(card._id)}
                      onDiscard={() => discardFromField(card._id)}
                      onReturn={() => returnToHand(card._id)}
                      onDragStart={e => handleDragStart(e, 'battlefield', card._id)}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Bottom strip: Hand + Graveyard ── */}
            <div style={{ display: 'flex', gap: 8, padding: '0 14px 10px', flexShrink: 0 }}>

              {/* Hand zone */}
              <div
                onDragOver={e => handleDragOver(e, 'hand')}
                onDrop={e => handleDrop(e, 'hand')}
                style={{
                  flex: 1, minWidth: 0,
                  background: dragOverZone === 'hand' ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                  border: `1.5px ${dragOverZone === 'hand' ? 'dashed #818cf8' : 'solid var(--border)'}`,
                  borderRadius: 10, padding: '8px 10px',
                  transition: 'background .15s, border-color .15s',
                }}
              >
                <div style={{
                  fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 6,
                }}>
                  ✋ Hand ({hand.length})
                  {hand.length > 0 && (
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, opacity: .7 }}>
                      click to play · drag to GY to discard
                    </span>
                  )}
                </div>
                {hand.length === 0 ? (
                  <div style={{
                    height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-muted)', fontSize: '.78rem',
                  }}>
                    {library.length === 0 ? 'Library empty' : 'No cards — hit Next Turn to draw'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                    {hand.map(card => (
                      <div
                        key={card._id}
                        draggable
                        onDragStart={e => handleDragStart(e, 'hand', card._id)}
                        onDragEnd={handleDragEnd}
                        style={{ flexShrink: 0, cursor: 'grab' }}
                        title="Click to play to battlefield · drag to GY to discard"
                      >
                        <SimCardImage
                          name={card.name}
                          width={80}
                          onClick={() => playCard(card._id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Graveyard zone */}
              <div
                onDragOver={e => handleDragOver(e, 'graveyard')}
                onDrop={e => handleDrop(e, 'graveyard')}
                style={{
                  width: 94, flexShrink: 0,
                  background: dragOverZone === 'graveyard' ? 'rgba(239,68,68,0.12)' : 'var(--bg-secondary)',
                  border: `1.5px ${dragOverZone === 'graveyard' ? 'dashed #f87171' : 'solid var(--border)'}`,
                  borderRadius: 10, padding: '8px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  transition: 'background .15s, border-color .15s',
                }}
              >
                <div style={{
                  fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: 6, textAlign: 'center',
                }}>
                  🪦 GY ({graveyard.length})
                </div>
                {graveyard.length === 0 ? (
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'rgba(248,113,113,0.22)', fontSize: '1.8rem',
                  }}>🪦</div>
                ) : (
                  <div style={{ position: 'relative', width: 72 }}>
                    <SimCardImage name={graveyard[0].name} width={72} dimmed />
                    {graveyard.length > 1 && (
                      <div style={{
                        position: 'absolute', top: -7, right: -7,
                        background: '#ef4444', color: '#fff', borderRadius: '50%',
                        width: 20, height: 20, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: '.65rem', fontWeight: 800,
                      }}>{graveyard.length}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ HAND MODE LAYOUT ════════════════ */}
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
                {library.length === 0 ? '📚 Library is empty' : 'Hand is empty — draw a card'}
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

        {/* ── Action bar ── */}
        <div style={{
          display: 'flex', gap: 8, padding: '12px 18px',
          borderTop: '1px solid var(--border)', flexShrink: 0,
          flexWrap: 'wrap', alignItems: 'center',
        }}>
          {mode === 'hand' ? (
            <>
              <button className="btn btn-ghost btn-sm" onClick={mulligan}>
                🔄 Mulligan {mulliganCount > 0 ? `(keep ${Math.max(1, 7 - mulliganCount)})` : ''}
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
