// ──────────────────────────────────────────────────────────────────────────────
// HeroLanding — full-screen hero overlay shown once per browser session.
//
// Shown on top of everything (z-index 1000). When the user clicks any CTA or
// the ✕ button, sessionStorage is written so they never see it again until they
// open a new tab/session. The parent (App.jsx) handles the actual navigation.
// ──────────────────────────────────────────────────────────────────────────────

const HERO_IMG = '/Hero-vault-v2.png'

export default function HeroLanding({ user, onNavigate, onAuthClick }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: '#08080a',
      overflow: 'hidden',
    }}>

      {/* ── Image layer — pushed right so cards don't crowd the text ── */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage:    `url(${HERO_IMG})`,
        backgroundSize:     'cover',
        backgroundPosition: 'right center',
        backgroundRepeat:   'no-repeat',
      }} />

      {/* ── Left → clear gradient: strong dark zone for legible text ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(8,8,10,0.95) 0%, rgba(8,8,10,0.85) 25%, rgba(8,8,10,0.55) 48%, rgba(8,8,10,0.15) 68%, rgba(8,8,10,0) 85%)',
        pointerEvents: 'none',
      }} />

      {/* ── Bottom fade into page background ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%',
        background: 'linear-gradient(to bottom, rgba(8,8,10,0) 0%, rgba(8,8,10,1) 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── ✕ close button (top-right) → goes to dashboard ── */}
      <button
        onClick={() => onNavigate('dashboard')}
        aria-label="Close and go to Dashboard"
        style={{
          position: 'absolute', top: 20, right: 20, zIndex: 10,
          width: 42, height: 42, borderRadius: '50%',
          background: 'rgba(255,255,255,.10)',
          border: '1.5px solid rgba(255,255,255,.28)',
          color: 'rgba(255,255,255,.85)',
          fontSize: '1rem', fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(10px)',
          transition: 'background .15s, border-color .15s',
          lineHeight: 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.22)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.55)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.10)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.28)' }}
      >✕</button>

      {/* ── Content ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        height: '100%',
        display: 'flex', alignItems: 'center',
        padding: '0 clamp(22px, 6vw, 80px)',
        maxWidth: 1400, margin: '0 auto',
      }}>
        <div style={{ maxWidth: 480, color: '#fff' }}>

          {/* Eyebrow */}
          <div style={{
            fontSize: '.72rem', fontWeight: 800, letterSpacing: '.2em',
            textTransform: 'uppercase', color: 'var(--accent-teal)',
            marginBottom: 18,
          }}>
            Collection Tools · Singles · Premium Repacks
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(2.4rem, 6vw, 4.4rem)',
            fontWeight: 800, lineHeight: 1.02,
            letterSpacing: '-.02em',
            margin: '0 0 32px',
            textShadow: '0 4px 28px rgba(0,0,0,.7)',
          }}>
            Stock Better<br />
            <span style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Singles.</span>
          </h1>

          {/* ── CTA buttons ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340 }}>

            <button
              onClick={() => onNavigate('dashboard')}
              style={{
                background: 'linear-gradient(135deg, var(--accent-gold) 0%, #f59e0b 100%)',
                color: '#0a0a0c', border: 'none',
                padding: '15px 28px', borderRadius: 99,
                fontSize: '.94rem', fontWeight: 800,
                cursor: 'pointer', letterSpacing: '.03em',
                boxShadow: '0 8px 24px rgba(245,158,11,.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity .15s, box-shadow .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '.9'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(245,158,11,.45)' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(245,158,11,.35)' }}
            >
              🏠 Go to Dashboard
            </button>

            <button
              onClick={() => onNavigate('store')}
              style={{
                background: 'rgba(20,184,166,.15)',
                color: 'var(--accent-teal)',
                border: '1.5px solid rgba(20,184,166,.5)',
                padding: '15px 28px', borderRadius: 99,
                fontSize: '.94rem', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '.03em',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s, border-color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(20,184,166,.25)'; e.currentTarget.style.borderColor = 'rgba(20,184,166,.8)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,184,166,.15)'; e.currentTarget.style.borderColor = 'rgba(20,184,166,.5)' }}
            >
              🛒 Shop Singles &amp; Repacks
            </button>

            <button
              onClick={() => onNavigate('collection')}
              style={{
                background: 'rgba(255,255,255,.08)',
                color: '#fff',
                border: '1.5px solid rgba(255,255,255,.28)',
                padding: '15px 28px', borderRadius: 99,
                fontSize: '.94rem', fontWeight: 700,
                cursor: 'pointer', letterSpacing: '.03em',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s, border-color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.16)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.28)' }}
            >
              📊 Manage Collection
            </button>

          </div>

          {/* ── Sign In / Sign Up — only shown when logged out ── */}
          {!user && (
            <button
              onClick={onAuthClick}
              style={{
                marginTop: 20,
                background: 'transparent',
                color: 'rgba(255,255,255,.65)',
                border: 'none',
                padding: '8px 0',
                fontSize: '.82rem', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '.02em',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color .15s',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.65)' }}
            >
              <span style={{
                display: 'inline-block', width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.28)',
                textAlign: 'center', lineHeight: '18px', fontSize: '.75rem',
              }}>👤</span>
              Sign In / Sign Up
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
