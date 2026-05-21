import { hasSupabase } from '../lib/supabase'
import logoPng from '../assets/vaulted_singles_logo.png'
import NotificationBell from './NotificationBell'

export default function TopBar({ page, user, setPage, onLogMatch, onAuthClick, onMenuClick, onLogoClick }) {
  return (
    <div id="topbar">
      <div className="topbar-left">
        <button className="btn-icon" onClick={onMenuClick} id="menu-btn" aria-label="Open menu">
          ☰
        </button>
        {/* Logo + wordmark — tapping goes to dashboard */}
        <div
          onClick={onLogoClick}
          style={{ display: 'flex', alignItems: 'center', userSelect: 'none', cursor: 'pointer' }}
        >
          <img
            src={logoPng}
            alt="Vaulted Singles"
            style={{
              height: '40px', width: 'auto', display: 'block',
              filter: 'invert(1) sepia(1) hue-rotate(12deg) saturate(3) brightness(0.82)',
              mixBlendMode: 'screen',
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
