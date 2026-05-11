import { hasSupabase } from '../lib/supabase'
import logoPng from '../assets/vaulted_singles_logo.png'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL

export default function Sidebar({ page, setPage, user, onAuthClick, sidebarOpen, setSidebarOpen }) {
  const isAdmin = user?.email === ADMIN_EMAIL

  const navItems = [
    { id: 'dashboard',  icon: '🏠', label: 'Dashboard',        section: 'Main'      },
    { id: 'store',      icon: '🏪', label: 'Store',             section: 'Main'      },
    { id: 'about',      icon: '💬', label: 'About Us',          section: 'Main'      },
    { id: 'cards',      icon: '🔍', label: 'Card Lookup',       section: 'Resources' },
    { id: 'releases',   icon: '📅', label: 'Set Releases',      section: 'Resources' },
    { id: 'news',       icon: '📰', label: 'MTG News',          section: 'Resources' },
    { id: 'collection', icon: '📦', label: 'My Collection',     section: 'Tools',    requiresSupabase: true },
    { id: 'decks',      icon: '🃏', label: 'My Decks',          section: 'Tools',    requiresSupabase: true },
    { id: 'wishlist',   icon: '🎯', label: 'Wishlist',          section: 'Tools',    requiresSupabase: true },
    { id: 'log',        icon: '⚔️', label: 'Match Log',         section: 'Tools',    requiresSupabase: true },
    { id: 'stats',      icon: '📊', label: 'Stats',             section: 'Tools',    requiresSupabase: true },
    { id: 'friends',    icon: '🤝', label: 'Friends & Trades',  section: 'Social',   requiresSupabase: true },
    { id: 'admin',      icon: '🎛️', label: 'Control Center',   section: 'Admin',    requiresAdmin: true },
  ]

  const sections = {
    Main:      navItems.filter(i => i.section === 'Main'),
    Resources: navItems.filter(i => i.section === 'Resources'),
    Tools:     navItems.filter(i => i.section === 'Tools'),
    Social:    navItems.filter(i => i.section === 'Social'),
    Admin:     navItems.filter(i => i.section === 'Admin'),
  }

  const handleNavClick = (pageId) => {
    setPage(pageId)
    setSidebarOpen(false)
  }

  return (
    <div id="sidebar" className={sidebarOpen ? 'mobile-open' : ''}>
      <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 16px' }}>
        <img
          src={logoPng}
          alt="Vaulted Singles"
          style={{
            width: '140px', height: 'auto',
            filter: 'invert(1) sepia(0.6) saturate(4) hue-rotate(10deg)',
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {['Main', 'Resources', 'Tools', 'Social', 'Admin'].map(section => {
        const items = sections[section]
        const visibleItems = items.filter(i =>
          (!i.requiresSupabase || hasSupabase) &&
          (!i.requiresAdmin || isAdmin)
        )
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
