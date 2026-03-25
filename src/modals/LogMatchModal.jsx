import { useState } from 'react'
import { addMatch } from '../lib/db'

export default function LogMatchModal({ onClose, user, matches, setMatches, showToast }) {
  const [form, setForm] = useState({
    format: 'Commander',
    date: new Date().toISOString().split('T')[0],
    myDeck: '',
    myColors: 'W',
    oppDeck: '',
    oppType: 'Aggro',
    result: 'win',
    notes: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const newMatch = await addMatch(form, user?.id)
    setMatches([newMatch, ...matches])
    showToast('Match logged successfully!')
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="modal-box" style={{ maxWidth: '520px' }}>
        <h3>⚔️ Log New Match</h3>

        <form onSubmit={handleSubmit}>
          <div className="grid-2 gap-12">
            <div className="form-group">
              <label className="form-label">Format</label>
              <select className="form-select" name="format" value={form.format} onChange={handleChange}>
                <option>Commander</option>
                <option>Standard</option>
                <option>Modern</option>
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
              <input type="text" className="form-input" name="myDeck" value={form.myDeck} onChange={handleChange} placeholder="Deck name" />
            </div>
            <div className="form-group">
              <label className="form-label">My Colors</label>
              <select className="form-select" name="myColors" value={form.myColors} onChange={handleChange}>
                <option value="W">⚪ White</option>
                <option value="U">🔵 Blue</option>
                <option value="B">⚫ Black</option>
                <option value="R">🔴 Red</option>
                <option value="G">🟢 Green</option>
                <option value="WU">WU - Azorius</option>
                <option value="UB">UB - Dimir</option>
                <option value="BR">BR - Rakdos</option>
                <option value="RG">RG - Gruul</option>
                <option value="GW">GW - Selesnya</option>
                <option value="WUB">WUB - Esper</option>
                <option value="WUBRG">WUBRG - 5 Color</option>
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
                <option>Aggro</option>
                <option>Control</option>
                <option>Midrange</option>
                <option>Combo</option>
                <option>Ramp</option>
                <option>Stax</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Result</label>
            <div className="outcome-toggle">
              <button type="button" className={`outcome-btn win ${form.result === 'win' ? 'selected' : ''}`} onClick={() => setForm(p => ({ ...p, result: 'win' }))}>
                🏆 Win
              </button>
              <button type="button" className={`outcome-btn loss ${form.result === 'loss' ? 'selected' : ''}`} onClick={() => setForm(p => ({ ...p, result: 'loss' }))}>
                💀 Loss
              </button>
              <button type="button" className={`outcome-btn draw ${form.result === 'draw' ? 'selected' : ''}`} onClick={() => setForm(p => ({ ...p, result: 'draw' }))}>
                🤝 Draw
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" name="notes" value={form.notes} onChange={handleChange} placeholder="Optional notes" />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Match</button>
          </div>
        </form>
      </div>
    </div>
  )
}
