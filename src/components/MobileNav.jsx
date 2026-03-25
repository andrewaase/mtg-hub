export default function MobileNav({ page, setPage }) {
  const items = [
    { id: 'dashboard', icon: '🏠', label: 'Home' },
    { id: 'log', icon: '⚔️', label: 'Matches' },
    { id: 'stats', icon: '📊', label: 'Stats' },
    { id: 'meta', icon: '📈', label: 'Meta' },
    { id: 'news', icon: '📰', label: 'News' },
    { id: 'cards', icon: '🔍', label: 'Cards' },
    { id: 'collection', icon: '📦', label: 'Collection' },
  ]

  return (
    <div id="mobile-nav">
      <div className="mobile-nav-items">
        {items.map(item => (
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
