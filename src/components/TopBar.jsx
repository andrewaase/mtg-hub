import { hasSupabase } from '../lib/supabase'
const logoPng = '/Mana-Mint-Logo-With-Box.png'
import NotificationBell from './NotificationBell'

export default function TopBar({ page, user, setPage, onLogMatch, onAuthClick, onMenuClick, onLogoClick }) {
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
            padding: '7px 10px',
            cursor: 'pointer',
            fontSize: '1.1rem',
            lineHeight: 1,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 38,
            minHeight: 38,
          }}
        >
          ☰
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
