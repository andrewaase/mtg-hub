export default function MobileNav({ page, setPage, openLogMatch }) {
  const leftItems = [
    { id: 'dashboard',  icon: '🏠', label: 'Home' },
    { id: 'collection', icon: '💎', label: 'Collection' },
  ]

  const rightItems = [
    { id: 'stats', icon: '📊', label: 'Stats' },
    { id: 'decks', icon: '🃏', label: 'Decks' },
  ]

  return (
    <div id="mobile-nav">
      <div className="mobile-nav-items">
        {leftItems.map(item => (
          <div
            key={item.id}
            className={`mobile-nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </div>
        ))}

        {/* Center FAB */}
        <div className="mobile-nav-fab-wrap">
          <button className="mobile-nav-fab" onClick={openLogMatch} aria-label="Log Match">
            +
          </button>
          <span className="mobile-nav-fab-label">Log</span>
        </div>

        {rightItems.map(item => (
          <div
            key={item.id}
            className={`mobile-nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}
