import { useState, useEffect } from 'react'
import { getDecks, saveDeck, deleteDeck } from '../lib/db'
import { toArenaFormat, countCards, isCommanderFormat, FORMAT_COLORS, deckToText } from '../lib/deckUtils'
import ImportDeckModal from '../modals/ImportDeckModal'

const FORMAT_ALL = 'All'

export default function Decks({ user, showToast }) {
  const [decks, setDecks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState(null)   // deck currently being viewed
  const [showImport, setShowImport] = useState(false)
  const [editDeck, setEditDeck]     = useState(null)   // deck being edited (passed to modal)
  const [formatFilter, setFormatFilter] = useState(FORMAT_ALL)
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => { setEditDeck(null); setShowImport(true) }}>
          + New Deck
        </button>
        <button className="btn btn-ghost" onClick={() => { setEditDeck(null); setShowImport(true) }}>
          📥 Import
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '.82rem', color: 'var(--text-muted)' }}>
          {decks.length} deck{decks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Format filter */}
      {decks.length > 0 && (
        <div className="tabs" style={{ marginBottom: '20px' }}>
          {formats.map(f => (
            <button
              key={f}
              className={`tab ${formatFilter === f ? 'active' : ''}`}
              onClick={() => setFormatFilter(f)}
            >
              {f}
            </button>
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

      {/* Deck grid */}
      {filtered.length > 0 && (
        <div className="grid-3">
          {filtered.map(deck => (
            <DeckCard
              key={deck.id}
              deck={deck}
              onClick={() => setSelected(deck)}
              onEdit={() => { setEditDeck(deck); setShowImport(true) }}
              onDelete={() => handleDelete(deck)}
            />
          ))}
        </div>
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

// ── Deck card (grid tile) ─────────────────────────────────────────────────

function DeckCard({ deck, onClick, onEdit, onDelete }) {
  const { main, side } = countCards(deck)
  const fmt = FORMAT_COLORS[deck.format] || { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' }
  const isCmdr = isCommanderFormat(deck.format)
  const updated = deck.updatedAt || deck.updated_at

  return (
    <div
      className="stat-card"
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={onClick}
    >
      {/* Format badge */}
      <div style={{
        display: 'inline-block', fontSize: '.65rem', fontWeight: 700,
        padding: '2px 8px', borderRadius: '4px', marginBottom: '10px',
        background: fmt.bg, color: fmt.color, textTransform: 'uppercase', letterSpacing: '.5px'
      }}>
        {deck.format}
      </div>

      <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '4px', lineHeight: 1.3 }}>
        {deck.name}
      </div>

      {isCmdr && deck.commander && (
        <div style={{ fontSize: '.75rem', color: 'var(--accent-gold)', marginBottom: '4px' }}>
          ⚔ {deck.commander}
        </div>
      )}

      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
        {main} cards{side > 0 ? ` · ${side} sideboard` : ''}
      </div>

      {updated && (
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          {new Date(updated).toLocaleDateString()}
        </div>
      )}

      {/* Action buttons — stop propagation so clicks don't open the detail view */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}
           onClick={e => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: '.7rem' }}
                onClick={onEdit}>✏️ Edit</button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: '.7rem', color: '#ef5350' }}
                onClick={onDelete}>🗑️</button>
      </div>
    </div>
  )
}

// ── Deck detail view ──────────────────────────────────────────────────────

function DeckDetail({ deck, onBack, onEdit, onDelete, onCopyArena, copied, showModal, onModalClose, onModalSave, editDeck }) {
  const { main, side } = countCards(deck)
  const isCmdr = isCommanderFormat(deck.format)
  const fmt = FORMAT_COLORS[deck.format] || { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' }

  // Group mainboard by rough category (heuristic using card name patterns is unreliable;
  // just display in order but split by natural section if user formatted with comments)
  const mainboard = deck.mainboard || []
  const sideboard = deck.sideboard || []

  return (
    <div>
      {/* Back button + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
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

      {/* Card list */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>

        {/* Commander */}
        {isCmdr && deck.commander && (
          <DeckSection title="Commander" cards={[{ qty: 1, name: deck.commander }]} highlight />
        )}

        {/* Main deck */}
        {mainboard.length > 0 && (
          <DeckSection title={isCmdr ? `Deck (${main - 1})` : `Main Deck (${main})`} cards={mainboard} />
        )}

        {/* Sideboard */}
        {sideboard.length > 0 && (
          <DeckSection title={`Sideboard (${side})`} cards={sideboard} />
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

function DeckSection({ title, cards, highlight }) {
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
      {cards.map((card, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '3px 0', borderBottom: i < cards.length - 1 ? '1px solid var(--bg-secondary)' : 'none'
        }}>
          <span style={{ fontSize: '.85rem', color: 'var(--text-primary)' }}>{card.name}</span>
          <span style={{
            fontSize: '.78rem', fontWeight: 700, marginLeft: '8px', flexShrink: 0,
            color: card.qty > 1 ? 'var(--accent-gold)' : 'var(--text-muted)'
          }}>
            ×{card.qty}
          </span>
        </div>
      ))}
    </div>
  )
}
