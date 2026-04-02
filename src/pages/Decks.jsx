import { useState, useEffect, useRef } from 'react'
import { getDecks, saveDeck, deleteDeck } from '../lib/db'
import { toArenaFormat, countCards, isCommanderFormat, FORMAT_COLORS, deckToText } from '../lib/deckUtils'
import { getDeckValueSync, fetchUnknownDeckPrices } from '../lib/pricing'
import ImportDeckModal from '../modals/ImportDeckModal'

const FORMAT_ALL = 'All'

export default function Decks({ user, collection, showToast }) {
  const [decks, setDecks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [editDeck, setEditDeck]     = useState(null)
  const [formatFilter, setFormatFilter] = useState(FORMAT_ALL)
  const [activeTab, setActiveTab]   = useState('my')   // 'my' | 'explore'
  const [copied, setCopied]         = useState(false)

  useEffect(() => {
    getDecks(user?.id).then(d => { setDecks(d); setLoading(false) })
  }, [user])

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleSave = async (deckData) => {
    const saved = await saveDeck(deckData, user?.id)
    if (deckData.id) {
      setDecks(decks.map(d => d.id === deckData.id ? saved : d))
      if (selected?.id === deckData.id) setSelected(saved)
    } else {
      setDecks([saved, ...decks])
    }
    setShowImport(false)
    setEditDeck(null)
    showToast(deckData.id ? 'Deck updated ✓' : 'Deck imported ✓')
  }

  const handleDelete = async (deck) => {
    if (!window.confirm(`Delete "${deck.name}"? This can't be undone.`)) return
    await deleteDeck(deck.id, user?.id)
    setDecks(decks.filter(d => d.id !== deck.id))
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

  const formats = [FORMAT_ALL, ...Array.from(new Set(decks.map(d => d.format))).sort()]
  const filtered = formatFilter === FORMAT_ALL ? decks : decks.filter(d => d.format === formatFilter)

  // ── Views ─────────────────────────────────────────────────────────────────

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
      />
    )
  }

  // Group decks by a tag/group field (or ungrouped)
  const grouped = {}
  filtered.forEach(deck => {
    const group = deck.group || 'My Decks'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(deck)
  })

  return (
    <div>
      {/* Tabs: My Decks | Explore */}
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
          {/* Format filter */}
          {decks.length > 0 && (
            <div className="tabs" style={{ marginBottom: '16px' }}>
              {formats.map(f => (
                <button key={f} className={`tab ${formatFilter === f ? 'active' : ''}`} onClick={() => setFormatFilter(f)}>{f}</button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && decks.length === 0 && (
            <div className="empty-state" style={{ padding: '60px 20px' }}>
              <div className="empty-icon">🃏</div>
              <p>No decks yet.<br />Import a decklist to get started.</p>
              <button className="btn btn-primary" onClick={() => setShowImport(true)} style={{ marginTop: '16px' }}>
                + Import Deck
              </button>
            </div>
          )}

          {/* Card-art deck grid grouped */}
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

// ── Deck art tile ────────────────────────────────────────────────────────────

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
  const isCmdr   = isCommanderFormat(deck.format)

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
      {/* Action buttons */}
      <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}
           onClick={e => e.stopPropagation()}>
        <button onClick={onEdit} style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '.68rem', color: '#fff', cursor: 'pointer' }}>✏️</button>
        <button onClick={onDelete} style={{ background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '.68rem', color: '#f87171', cursor: 'pointer' }}>🗑</button>
      </div>
    </div>
  )
}

// ── Deck detail view ──────────────────────────────────────────────────────

function DeckDetail({ deck, collection, onBack, onEdit, onDelete, onCopyArena, copied, showModal, onModalClose, onModalSave, editDeck }) {
  const { main, side } = countCards(deck)
  const isCmdr = isCommanderFormat(deck.format)
  const fmt = FORMAT_COLORS[deck.format] || { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' }

  const mainboard = deck.mainboard || []
  const sideboard = deck.sideboard || []

  // Budget tracker
  const [deckValue,   setDeckValue]   = useState(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [fetchProg,   setFetchProg]   = useState(null)

  useEffect(() => {
    const v = getDeckValueSync(deck, collection || [])
    setDeckValue(v)
  }, [deck, collection])

  async function handleFetchAllPrices() {
    if (!deckValue || fetchingAll) return
    setFetchingAll(true)
    setFetchProg({ done: 0, total: deckValue.unknownCards.length })
    const prices = await fetchUnknownDeckPrices(deckValue.unknownCards, {
      onProgress: (done, total) => setFetchProg({ done, total }),
    })
    setDeckValue(prev => {
      if (!prev) return prev
      const cardValues = { ...prev.cardValues, ...prices }
      const totalValue = Object.entries(cardValues).reduce((s, [name, p]) => {
        if (p == null) return s
        const allCards = [...mainboard, ...sideboard, ...(deck.commander ? [{ name: deck.commander, qty: 1 }] : [])]
        const card = allCards.find(c => c.name === name)
        return s + (p * (card?.qty || 1))
      }, 0)
      return { ...prev, cardValues, cachedValue: totalValue, unknownCards: [] }
    })
    setFetchingAll(false)
    setFetchProg(null)
  }

  return (
    <div>
      {/* Back button + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ flexShrink: 0 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'inline-block', fontSize: '.65rem', fontWeight: 700,
            padding: '2px 8px', borderRadius: '4px', marginBottom: '6px',
            background: fmt.bg, color: fmt.color, textTransform: 'uppercase', letterSpacing: '.5px'
          }}>
            {deck.format}
          </div>
          <h2 style={{ margin: 0, fontSize: '1.3rem' }}>{deck.name}</h2>
          {isCmdr && deck.commander && (
            <div style={{ fontSize: '.82rem', color: 'var(--accent-gold)', marginTop: '4px' }}>
              Commander: {deck.commander}
            </div>
          )}
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {main} cards{side > 0 ? ` · ${side} sideboard` : ''}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button
            className={`btn btn-sm ${copied ? 'btn-ghost' : 'btn-primary'}`}
            onClick={onCopyArena}
            style={{ fontWeight: 700 }}
          >
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
            <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>
              Deck Value
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
              ${deckValue.cachedValue.toFixed(2)}
            </div>
          </div>
          {deckValue.ownedValue > 0 && deckValue.ownedValue !== deckValue.cachedValue && (
            <div>
              <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                You Own
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-teal)' }}>
                ${deckValue.ownedValue.toFixed(2)}
              </div>
            </div>
          )}
          {deckValue.unknownCards.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                {deckValue.unknownCards.length} cards without prices
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleFetchAllPrices}
                disabled={fetchingAll}
                style={{ fontSize: '.7rem' }}
              >
                {fetchingAll
                  ? `Fetching ${fetchProg?.done || 0}/${fetchProg?.total || '?'}…`
                  : '🔄 Fetch Market Prices'
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* Card list */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>

        {/* Commander */}
        {isCmdr && deck.commander && (
          <DeckSection title="Commander" cards={[{ qty: 1, name: deck.commander }]} highlight cardValues={deckValue?.cardValues} />
        )}

        {/* Main deck */}
        {mainboard.length > 0 && (
          <DeckSection title={isCmdr ? `Deck (${main - 1})` : `Main Deck (${main})`} cards={mainboard} cardValues={deckValue?.cardValues} />
        )}

        {/* Sideboard */}
        {sideboard.length > 0 && (
          <DeckSection title={`Sideboard (${side})`} cards={sideboard} cardValues={deckValue?.cardValues} />
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

// ── Card section ──────────────────────────────────────────────────────────

function DeckSection({ title, cards, highlight, cardValues }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${highlight ? 'var(--accent-gold)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)', padding: '14px 16px'
    }}>
      <div style={{
        fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px',
        color: highlight ? 'var(--accent-gold)' : 'var(--text-muted)', marginBottom: '10px'
      }}>
        {title}
      </div>
      {cards.map((card, i) => {
        const price = cardValues?.[card.name]
        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '3px 0', borderBottom: i < cards.length - 1 ? '1px solid var(--bg-secondary)' : 'none'
          }}>
            <span style={{ fontSize: '.83rem', color: 'var(--text-primary)', flex: 1, minWidth: 0 }}>{card.name}</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexShrink: 0, marginLeft: '8px' }}>
              {price != null && (
                <span style={{ fontSize: '.68rem', color: 'var(--accent-gold)' }}>
                  ${(price * card.qty).toFixed(2)}
                </span>
              )}
              <span style={{
                fontSize: '.76rem', fontWeight: 700,
                color: card.qty > 1 ? 'var(--accent-gold)' : 'var(--text-muted)'
              }}>
                ×{card.qty}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
