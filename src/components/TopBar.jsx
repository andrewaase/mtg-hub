import { hasSupabase } from '../lib/supabase'
import logoSvg from '../assets/vaulted_singles_logo.svg'

export default function TopBar({ page, user, onLogMatch, onAuthClick, onMenuClick, onLogoClick }) {
  return (
    <div id="topbar">
      <div className="topbar-left">
        <button className="btn-icon" onClick={onMenuClick} id="menu-btn" aria-label="Open menu">
          ☰
        </button>
        {/* Logo + wordmark — tapping goes to dashboard */}
        <div
          onClick={onLogoClick}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none', cursor: 'pointer' }}
        >
          <img
            src={logoSvg}
            alt="Vaulted Singles"
            style={{ height: '32px', width: 'auto', display: 'block' }}
          />
          <div style={{ lineHeight: 1 }}>
            <div style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontWeight: 700,
              fontSize: '.88rem',
              color: 'var(--accent-gold)',
              letterSpacing: '.5px',
            }}>VAULTED</div>
            <div style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '.6rem',
              color: '#8b5ea4',
              letterSpacing: '2px',
              marginTop: '1px',
            }}>SINGLES</div>
          </div>
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
