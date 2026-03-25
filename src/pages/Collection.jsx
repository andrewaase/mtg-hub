import { useState, useEffect } from 'react'
import { removeCard, exportData } from '../lib/db'

export default function Collection({ collection, setCollection, user, openAddCard, showToast }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filteredByColor = filter === 'all' ? collection : collection.filter(c => (c.colors || []).includes(filter))
  const filtered = search ? filteredByColor.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : filteredByColor

  const handleRemove = async (id) => {
    await removeCard(id, user?.id)
    setCollection(collection.filter(c => c.id !== id))
    showToast('Card removed')
  }

  const handleExport = () => {
    const csv = 'Name,Quantity,Condition,Set\n' + filtered.map(c => `${c.name},${c.qty},${c.condition},${c.setName}`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'collection.csv'
    a.click()
    showToast('Exported to CSV')
  }

  const handleBackup = () => {
    exportData([], collection)
    showToast('Backup created')
  }

  const total = collection.reduce((sum, c) => sum + c.qty, 0)

  return (
    <div>
      <div className="collection-controls">
        <input type="text" className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '300px' }} />
        <button className="btn btn-primary" onClick={() => openAddCard()}>+ Add Card</button>
        <button className="btn btn-ghost" onClick={handleExport}>⬇️ CSV</button>
        <button className="btn btn-ghost" onClick={handleBackup}>💾 Backup</button>
        <span style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--text-muted)' }}>{total} cards</span>
      </div>

      <div className="tabs">
        {['all', 'W', 'U', 'B', 'R', 'G'].map(f => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All Cards' : { W: '☀️ White', U: '💧 Blue', B: '💀 Black', R: '🔥 Red', G: '🌿 Green' }[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">📦</div>
          <p>Collection is empty.<br/>Add cards manually or scan them!</p>
          <button className="btn btn-primary" onClick={() => openAddCard()} style={{ marginTop: '16px' }}>+ Add Card</button>
        </div>
      ) : (
        <div className="collection-grid">
          {filtered.map(card => (
            <div key={card.id} className="col-card">
              {card.img && <img src={card.img} alt={card.name} />}
              <div className="col-card-info">
                <div className="col-card-name">{card.name}</div>
                <div className="col-card-set">{card.setName}</div>
              </div>
              <span className="col-card-qty">×{card.qty}</span>
              <button className="col-card-remove" onClick={() => handleRemove(card.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
