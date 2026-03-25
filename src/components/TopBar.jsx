import { hasSupabase } from '../lib/supabase'

export default function TopBar({ page, user, onLogMatch, onAuthClick, onMenuClick }) {
  const titles = {
    dashboard: 'Dashboard',
    log: 'Match Log',
    stats: 'Stats',
    news: 'MTG News',
    cards: 'Card Lookup',
    collection: 'My Collection',
    meta: 'Meta Tracker',
    friends: 'Friends & Trades',
  }

  return (
    <div id="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button className="btn-icon" onClick={onMenuClick} style={{ display: 'none' }} id="menu-btn">☰</button>
        <h2>{titles[page] || 'MTG Hub'}</h2>
      </div>
      <div className="topbar-actions">
        {page !== 'dashboard' && page !== 'friends' && (
          <button className="btn btn-primary btn-sm" onClick={onLogMatch}>+ Log Match</button>
        )}
        {!user && hasSupabase && (
          <button className="btn btn-primary btn-sm" onClick={onAuthClick}>Sign In</button>
        )}
      </div>
    </div>
  )
}
