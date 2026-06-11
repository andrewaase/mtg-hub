/* global __BUILD_HASH__, __BUILD_TIME__ */
import { useState, useRef, useEffect } from 'react'
import { hasSupabase } from '../lib/supabase'
const logoPng = '/Horizontal-Mana-Mint-logo-transparent.png'

export default function Sidebar({ page, setPage, user, isAdmin, onAuthClick, sidebarOpen, setSidebarOpen }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const navItems = [
    { id: 'dashboard',  label: 'Dashboard',        section: 'Main'      },
    { id: 'store',      label: 'Store',             section: 'Main'      },
    { id: 'membership', label: 'MM Pro',             section: 'Main'      },
    { id: 'about',      label: 'About Us',          section: 'Main'      },
    { id: 'cards',      label: 'Card Lookup',       section: 'Resources' },
    { id: 'releases',   label: 'Set Releases',      section: 'Resources' },
    { id: 'news',       label: 'MTG News',          section: 'Resources' },
    { id: 'collection', label: 'My Collection',     section: 'Tools',    requiresSupabase: true },
    { id: 'decks',      label: 'My Decks',          section: 'Tools',    requiresSupabase: true },
    { id: 'wishlist',   label: 'Wishlist',          section: 'Tools',    requiresSupabase: true },
    { id: 'log',        label: 'Match Log',         section: 'Tools',    requiresSupabase: true },
    { id: 'stats',      label: 'Stats',             section: 'Tools',    requiresSupabase: true },
    { id: 'lifetracker', label: 'Life Tracker',     section: 'Social' },
    { id: 'friends',    label: 'Friends & Trades',  section: 'Social',   requiresSupabase: true },
    { id: 'admin',      label: 'Control Center',   section: 'Admin',    requiresAdmin: true },
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
    setMenuOpen(false)
  }

  const menuItems = [
    ...(user ? [{ label: 'Account Settings', icon: '⚙️', action: () => { onAuthClick(); setMenuOpen(false) } }] : []),
  ]

  return (
    <div id="sidebar" className={sidebarOpen ? 'mobile-open' : ''}>
      <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 16px', paddingTop: 'calc(20px + var(--safe-top))' }}>
        <img
          src={logoPng}
          alt="Mana Mint"
          onClick={() => { setPage('dashboard'); setSidebarOpen(false) }}
          style={{ width: '160px', height: 'auto', cursor: 'pointer' }}
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
                {item.label}
              </button>
            ))}
          </div>
        )
      })}

      <div style={{ flex: 1 }} />

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', position: 'relative' }} ref={menuRef}>

        {/* Profile popover menu */}
        {menuOpen && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 12, right: 12,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
            zIndex: 200,
          }}>
            {menuItems.map((item, i) => (
              <button
                key={i}
                onClick={item.action}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 16px', background: 'none', border: 'none',
                  color: 'var(--text-primary)', fontSize: '.85rem', fontWeight: 500,
                  cursor: 'pointer', textAlign: 'left', transition: 'background .15s',
                  borderBottom: i < menuItems.length - 1 ? '1px solid var(--border)' : 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: '1rem', width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            ))}

            {/* Build stamp inside menu */}
            <div style={{
              padding: '8px 16px', fontSize: '.62rem', color: 'var(--text-muted)',
              borderTop: '1px solid var(--border)', letterSpacing: '.3px',
            }}>
              build {__BUILD_HASH__} · {new Date(__BUILD_TIME__).toLocaleString()}
            </div>
          </div>
        )}

        {/* Profile / Sign In row */}
        {user ? (
          <div
            onClick={() => setMenuOpen(v => !v)}
            title="Account menu"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              cursor: 'pointer', borderRadius: 10, padding: '6px 8px',
              margin: '-6px -8px', transition: 'background .15s',
              background: menuOpen ? 'rgba(255,255,255,.05)' : 'transparent',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.05)'}
            onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent' }}
          >
            <div className="user-avatar" style={{ backgroundColor: '#16a389' }}>
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div style={{ fontSize: '.8rem', minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email?.split('@')[0]}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>Signed in</div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '.7rem', marginLeft: 'auto' }}>
              {menuOpen ? '▾' : '›'}
            </span>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onAuthClick}>
            Sign In
          </button>
        )}

        {/* Footer links — always visible */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
          {[['Privacy', 'privacy'], ['Terms', 'terms'], ['Support', 'support']].map(([label, id]) => (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                fontSize: '.68rem', cursor: 'pointer', padding: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
