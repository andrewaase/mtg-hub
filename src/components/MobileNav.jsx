import { useState } from 'react'

// Inline SVG icons — no external deps, no emoji, sharp at any DPI
const Icons = {
  home: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  collection: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="14" height="16" rx="2"/>
      <path d="M6 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2"/>
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <line x1="16.5" y1="16.5" x2="22" y2="22"/>
    </svg>
  ),
  decks: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="6" width="12" height="15" rx="2"/>
      <path d="M8 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-2"/>
    </svg>
  ),
  camera: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),
  edit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  swords: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/>
      <line x1="13" y1="19" x2="19" y2="13"/>
      <line x1="16" y1="16" x2="20" y2="20"/>
      <line x1="19" y1="21" x2="21" y2="19"/>
    </svg>
  ),
}

export default function MobileNav({ page, setPage, openLogMatch, openCamera, openAddCard }) {
  const [showSheet, setShowSheet] = useState(false)

  const leftItems = [
    { id: 'dashboard',  label: 'Home',       icon: Icons.home       },
    { id: 'collection', label: 'Collection', icon: Icons.collection },
  ]

  const rightItems = [
    { id: 'cards', label: 'Lookup', icon: Icons.search },
    { id: 'decks', label: 'Decks',  icon: Icons.decks  },
  ]

  return (
    <>
      {/* Backdrop */}
      {showSheet && (
        <div
          onClick={() => setShowSheet(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 199 }}
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
          <SheetBtn icon={Icons.camera} label="Scan a Card"   sub="Use your camera"  onClick={() => { setShowSheet(false); openCamera?.() }} />
          <SheetBtn icon={Icons.edit}   label="Type Manually" sub="Search by name"   onClick={() => { setShowSheet(false); openAddCard?.() }} />
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 10px' }} />
          <SheetBtn icon={Icons.swords} label="Log a Match" onClick={() => { setShowSheet(false); openLogMatch?.() }} muted />
        </div>
      )}

      <div id="mobile-nav">
        <div className="mobile-nav-items">
          {leftItems.map(item => (
            <div
              key={item.id}
              className={`mobile-nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
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
            <div
              key={item.id}
              className={`mobile-nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
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
      {icon && (
        <span style={{ opacity: muted ? .5 : .8, flexShrink: 0 }}>{icon}</span>
      )}
      <div>
        <div>{label}</div>
        {sub && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '1px' }}>{sub}</div>}
      </div>
    </button>
  )
}
