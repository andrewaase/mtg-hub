import { hasSupabase } from '../lib/supabase'

export default function Sidebar({ page, setPage, user, onAuthClick, sidebarOpen, setSidebarOpen }) {
  const navItems = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard', section: 'Main' },
    { id: 'log', icon: '⚔️', label: 'Match Log', section: 'Main' },
    { id: 'stats', icon: '📊', label: 'Stats', section: 'Main' },
    { id: 'meta', icon: '📈', label: 'Meta Tracker', section: 'Resources' },
    { id: 'news', icon: '📰', label: 'MTG News', section: 'Resources' },
    { id: 'cards', icon: '🔍', label: 'Card Lookup', section: 'Resources' },
    { id: 'collection', icon: '📦', label: 'My Collection', section: 'Resources' },
    { id: 'decks', icon: '🃏', label: 'My Decks', section: 'Resources' },
    { id: 'wishlist', icon: '🎯', label: 'Wishlist', section: 'Resources' },
    { id: 'friends', icon: '🤝', label: 'Friends & Trades', section: 'Social', requiresSupabase: true },
  ]

  const sections = {
    Main: navItems.filter(i => i.section === 'Main'),
    Resources: navItems.filter(i => i.section === 'Resources'),
    Social: navItems.filter(i => i.section === 'Social'),
  }

  const handleNavClick = (pageId) => {
    setPage(pageId)
    setSidebarOpen(false)
  }

  return (
    <div id="sidebar" className={sidebarOpen ? 'mobile-open' : ''}>
      <div className="sidebar-logo">
        <h1>⚔ MTG Hub</h1>
        <p>Your Personal Command Center</p>
      </div>

      {['Main', 'Resources', 'Social'].map(section => {
        const items = sections[section]
        const visibleItems = items.filter(i => !i.requiresSupabase || hasSupabase)
        if (visibleItems.length === 0) return null
        return (
          <div key={section}>
            <div className="nav-section-label">{section}</div>
            {visibleItems.map(item => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => handleNavClick(item.id)}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )
      })}

      <div style={{ flex: 1 }} />

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="user-avatar" style={{ backgroundColor: '#c9a84c' }}>
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div style={{ fontSize: '.8rem' }}>
              <div style={{ fontWeight: 600 }}>{user.email?.split('@')[0]}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>Signed in</div>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onAuthClick}>
            Sign In
          </button>
        )}
      </div>
    </div>
  )
}
