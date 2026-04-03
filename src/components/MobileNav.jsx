import { useState } from 'react'

export default function MobileNav({ page, setPage, openLogMatch, openCamera, openAddCard }) {
  const [showSheet, setShowSheet] = useState(false)

  const leftItems = [
    { id: 'dashboard',  icon: '🏠', label: 'Home' },
    { id: 'collection', icon: '💎', label: 'Collection' },
  ]

  const rightItems = [
    { id: 'stats', icon: '📊', label: 'Stats' },
    { id: 'decks', icon: '🃏', label: 'Decks' },
  ]

  return (
    <>
      {/* Backdrop */}
      {showSheet && (
        <div
          onClick={() => setShowSheet(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            zIndex: 199, backdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* Action sheet */}
      {showSheet && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(var(--bottom-nav-height) + 14px)',
          left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '20px', padding: '8px', zIndex: 200,
          display: 'flex', flexDirection: 'column', gap: '2px',
          minWidth: '230px', boxShadow: '0 8px 40px rgba(0,0,0,.7)',
        }}>
          <SheetBtn icon="📷" label="Scan a Card" sub="Use your camera" onClick={() => { setShowSheet(false); openCamera?.() }} />
          <SheetBtn icon="✏️" label="Type Manually" sub="Search by name" onClick={() => { setShowSheet(false); openAddCard?.() }} />
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 10px' }} />
          <SheetBtn icon="⚔️" label="Log a Match" onClick={() => { setShowSheet(false); openLogMatch?.() }} muted />
        </div>
      )}

      <div id="mobile-nav">
        <div className="mobile-nav-items">
          {leftItems.map(item => (
            <div key={item.id} className={`mobile-nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
              <span className="icon">{item.icon}</span>
              {item.label}
            </div>
          ))}

          <div className="mobile-nav-fab-wrap">
            <button
              className="mobile-nav-fab"
              onClick={() => setShowSheet(s => !s)}
              aria-label="Add card"
              style={{ transform: showSheet ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}
            >
              +
            </button>
            <span className="mobile-nav-fab-label">Add</span>
          </div>

          {rightItems.map(item => (
            <div key={item.id} className={`mobile-nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
              <span className="icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function SheetBtn({ icon, label, sub, onClick, muted }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '14px',
        padding: '13px 16px', background: 'none', border: 'none',
        cursor: 'pointer', borderRadius: '14px',
        color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: '.9rem', fontWeight: muted ? 400 : 600, textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{icon}</span>
      <div>
        <div>{label}</div>
        {sub && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '1px' }}>{sub}</div>}
      </div>
    </button>
  )
}
