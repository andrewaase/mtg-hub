import { hasSupabase } from '../lib/supabase'

export default function TopBar({ page, user, onLogMatch, onAuthClick, onMenuClick }) {
  const titles = {
    dashboard:  'Dashboard',
    log:        'Match Log',
    stats:      'Stats',
    news:       'MTG News',
    cards:      'Card Lookup',
    collection: 'My Collection',
    meta:       'Meta Tracker',
    friends:    'Friends & Trades',
    decks:      'My Decks',
  }

  const title = titles[page] || 'MTG Hub'

  return (
    <div id="topbar">
      {/* Left: menu button (mobile) / menu button + title (desktop) */}
      <div className="topbar-left">
        <button className="btn-icon" onClick={onMenuClick} id="menu-btn" aria-label="Open menu">
          ☰
        </button>
        {/* Title shown inline on desktop via CSS */}
        <h2 className="topbar-title-inline">{title}</h2>
      </div>

      {/* Title centered on mobile via CSS absolute positioning */}
      <h2 className="topbar-title-center">{title}</h2>

      {/* Right: actions */}
      <div className="topbar-actions">
        {page !== 'friends' && (
          <button
            className="btn btn-primary btn-sm topbar-log-btn"
            onClick={onLogMatch}
          >
            + Log Match
          </button>
        )}
        {!user && hasSupabase && (
          <button className="btn btn-ghost btn-sm" onClick={onAuthClick}>
            Sign In
          </button>
        )}
        {user && (
          <div
            className="user-avatar"
            style={{ backgroundColor: 'var(--accent-gold)', color: '#1a1000' }}
            onClick={onAuthClick}
            title={user.email}
          >
            {user.email?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}
