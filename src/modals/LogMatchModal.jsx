import { useState, useEffect } from 'react'
import { addMatch, getDecks } from '../lib/db'

// Shared by "Deck Type" and "Opponent Type" — keep these two in sync.
const DECK_TYPES = ['Aggro', 'Control', 'Midrange', 'Combo', 'Ramp', 'Stax']

export default function LogMatchModal({ onClose, user, matches, setMatches, showToast }) {
  const [form, setForm] = useState({
    format: 'Commander',
    date: new Date().toISOString().split('T')[0],
    myDeck: '',
    // Column is still named myColors in the DB — now holds a deck archetype
    // (e.g. "Aggro") instead of a color identity.
    myColors: 'Aggro',
    oppDeck: '',
    oppType: 'Aggro',
    result: 'win',
    notes: '',
  })
  const [decks, setDecks] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getDecks(user?.id).then(d => { if (!cancelled) setDecks(d) })
    return () => { cancelled = true }
  }, [user?.id])

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const newMatch = await addMatch(form, user?.id)
      setMatches([newMatch, ...matches])
      showToast('Match logged successfully!')
      onClose()
    } catch (err) {
      console.error('[LogMatchModal] failed to save match:', err)
      showToast('Failed to save match — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: '520px' }}>
        <h3> Log New Match</h3>

        <form onSubmit={handleSubmit}>
          <div className="grid-2 gap-12">
            <div className="form-group">
              <label className="form-label">Format</label>
              <select className="form-select" name="format" value={form.format} onChange={handleChange}>
                <option>Commander</option>
                <option>Standard</option>
                <option>Pioneer</option>
                <option>Modern</option>
                <option>Legacy</option>
                <option>Premodern</option>
                <option>Brawl</option>
                <option>Historic</option>
                <option>Draft</option>
                <option>Sealed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-input" name="date" value={form.date} onChange={handleChange} />
            </div>
          </div>

          <div className="grid-2 gap-12">
            <div className="form-group">
              <label className="form-label">My Deck</label>
              <input type="text" className="form-input" name="myDeck" value={form.myDeck} onChange={handleChange} placeholder="Deck name" list="my-decks-list" autoComplete="off" />
              <datalist id="my-decks-list">
                {decks.map(d => <option key={d.id} value={d.name} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Deck Type</label>
              <select className="form-select" name="myColors" value={form.myColors} onChange={handleChange}>
                {DECK_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid-2 gap-12">
            <div className="form-group">
              <label className="form-label">Opponent Deck</label>
              <input type="text" className="form-input" name="oppDeck" value={form.oppDeck} onChange={handleChange} placeholder="Commander/Deck name" />
            </div>
            <div className="form-group">
              <label className="form-label">Opponent Type</label>
              <select className="form-select" name="oppType" value={form.oppType} onChange={handleChange}>
                {DECK_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Result</label>
            <div className="outcome-toggle">
              <button type="button" className={`outcome-btn win ${form.result === 'win' ? 'selected' : ''}`} onClick={() => setForm(p => ({ ...p, result: 'win' }))}>
                 Win
              </button>
              <button type="button" className={`outcome-btn loss ${form.result === 'loss' ? 'selected' : ''}`} onClick={() => setForm(p => ({ ...p, result: 'loss' }))}>
                 Loss
              </button>
              <button type="button" className={`outcome-btn draw ${form.result === 'draw' ? 'selected' : ''}`} onClick={() => setForm(p => ({ ...p, result: 'draw' }))}>
                 Draw
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes" />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save Match'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
