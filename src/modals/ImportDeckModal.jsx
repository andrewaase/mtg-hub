import { useState, useRef } from 'react'
import { parseDeckText, isCommanderFormat } from '../lib/deckUtils'

const FORMATS = [
  'Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage',
  'Commander', 'Brawl', 'Historic Brawl', 'Pauper', 'Alchemy', 'Explorer'
]

export default function ImportDeckModal({ onClose, onSave, existingDeck }) {
  const isEditing = !!existingDeck
  const [name, setName]       = useState(existingDeck?.name || '')
  const [format, setFormat]   = useState(existingDeck?.format || 'Standard')
  const [text, setText]       = useState(existingDeck ? buildExistingText(existingDeck) : '')
  const [error, setError]     = useState('')
  const fileRef               = useRef(null)

  function buildExistingText(deck) {
    const lines = []
    if (deck.commander) { lines.push('Commander'); lines.push(`1 ${deck.commander}`); lines.push('') }
    if (deck.mainboard?.length) {
      if (deck.commander) lines.push('Deck')
      deck.mainboard.forEach(c => lines.push(`${c.qty} ${c.name}`))
    }
    if (deck.sideboard?.length) {
      lines.push(''); lines.push('Sideboard')
      deck.sideboard.forEach(c => lines.push(`${c.qty} ${c.name}`))
    }
    return lines.join('\n')
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setText(ev.target.result || '')
    reader.readAsText(file)
    if (!name) setName(file.name.replace(/\.(txt|dec|dek|mwdeck)$/i, ''))
  }

  const handleSave = () => {
    setError('')
    if (!name.trim()) { setError('Give your deck a name.'); return }
    if (!text.trim())  { setError('Paste or upload a decklist.'); return }

    const parsed = parseDeckText(text, format)
    const main   = parsed.mainboard.reduce((s, c) => s + c.qty, 0)

    if (main === 0) {
      setError("Couldn't find any cards. Check your format — each line should start with a number, e.g. \"4 Lightning Bolt\".")
      return
    }

    const isCmdr = isCommanderFormat(format)
    if (isCmdr && !parsed.commander) {
      setError('Add a "Commander" section at the top with your commander, e.g.:\n\nCommander\n1 Raffine, Scheming Seer')
      return
    }

    onSave({
      ...(existingDeck || {}),
      name: name.trim(),
      format,
      commander: parsed.commander || null,
      mainboard: parsed.mainboard,
      sideboard: parsed.sideboard,
    })
  }

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}
    >
      <div className="modal-box" style={{ maxWidth: '560px', width: '100%', position: 'relative', transform: 'none', top: 'auto', left: 'auto', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{isEditing ? '✏️ Edit Deck' : '📥 Import Deck'}</h3>

        {/* Name + Format row */}
        <div className="grid-2 gap-12" style={{ marginBottom: '14px' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Deck Name</label>
            <input
              className="form-input"
              placeholder="e.g. My Dimir Midrange"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Format</label>
            <select className="form-select" value={format} onChange={e => setFormat(e.target.value)}>
              {FORMATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
        </div>

        {/* Paste area */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Decklist</label>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '.7rem' }}
              onClick={() => fileRef.current?.click()}
            >
              📂 Upload .txt / .dec
            </button>
            <input ref={fileRef} type="file" accept=".txt,.dec,.dek,.mwdeck" style={{ display: 'none' }} onChange={handleFile} />
          </div>
          <textarea
            className="form-input form-textarea"
            rows={14}
            placeholder={isCommanderFormat(format)
              ? `Commander\n1 Raffine, Scheming Seer\n\nDeck\n1 Arcane Signet\n1 Talisman of Dominance\n...`
              : `4 Lightning Bolt\n4 Counterspell\n...\n\nSideboard\n2 Negate\n...`
            }
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '.8rem', resize: 'vertical' }}
          />
        </div>

        {error && (
          <div style={{ color: '#ef5350', fontSize: '.8rem', marginBottom: '12px', whiteSpace: 'pre-line' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Supported: plain text, Arena format, Moxfield, Archidekt, MTGO .dec exports
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEditing ? 'Save Changes' : 'Import Deck'}
          </button>
        </div>
      </div>
    </div>
  )
}
