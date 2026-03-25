import { useState } from 'react'
import { formatDate } from '../lib/utils'
import { deleteMatch } from '../lib/db'

export default function MatchLog({ matches, setMatches, user, openLogMatch }) {
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? matches : matches.filter(m => m.format.toLowerCase() === filter.toLowerCase())

  const handleDelete = async (id) => {
    if (!confirm('Delete this match?')) return
    await deleteMatch(id, user?.id)
    setMatches(matches.filter(m => m.id !== id))
  }

  return (
    <div>
      <div className="tabs">
        {['all', 'commander', 'standard', 'modern'].map(f => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All Matches' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-icon">⚔️</div>
            <p>No matches found.</p>
            <button className="btn btn-primary" onClick={openLogMatch} style={{ marginTop: '16px' }}>+ Log Match</button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="match-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Format</th>
                  <th>My Deck</th>
                  <th>Opponent</th>
                  <th>Result</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr key={m.id}>
                    <td>{formatDate(m.date)}</td>
                    <td><span className="badge badge-format">{m.format}</span></td>
                    <td>{m.myDeck}</td>
                    <td>{m.oppDeck} ({m.oppType})</td>
                    <td><span className={`badge badge-${m.result}`}>{m.result.toUpperCase()}</span></td>
                    <td style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{m.notes?.slice(0, 30)}...</td>
                    <td>
                      <button className="btn-icon" onClick={() => handleDelete(m.id)} style={{ fontSize: '.9rem', color: 'var(--accent-red)' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
