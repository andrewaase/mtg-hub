import { hasSupabase } from '../lib/supabase'
const logoPng = '/Mana-Mint-Logo-With-Box.png'
import NotificationBell from './NotificationBell'

export default function TopBar({ page, user, setPage, onLogMatch, onAuthClick, onMenuClick, onLogoClick, hideLogMatch = false }) {
  return (
    <div id="topbar">
      <div className="topbar-left">
        <button
          onClick={onMenuClick}
          id="menu-btn"
          aria-label="Open menu"
          style={{
            background: 'var(--bg-hover)',
            border: '1.5px solid var(--border)',
            borderRadius: 8,
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5H16M2 9H16M2 13.5H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {/* Logo + wordmark — tapping goes to dashboard */}
        <div
          onClick={onLogoClick}
          style={{ display: 'flex', alignItems: 'center', userSelect: 'none', cursor: 'pointer' }}
        >
          <img
            src={logoPng}
            alt="Mana Mint"
            style={{
              height: '40px', width: 'auto', display: 'block',
              borderRadius: '10px',
            }}
          />
        </div>
      </div>

      {/* Right: actions */}
      <div className="topbar-actions">
        {page !== 'friends' && !hideLogMatch && (
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
        {user && hasSupabase && <NotificationBell user={user} setPage={setPage} />}
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
