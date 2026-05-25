// ──────────────────────────────────────────────────────────────────────────────
// Lab page — hidden experimental sandbox.
// Not in Sidebar or MobileNav; only reachable by visiting /#lab directly.
// Use this to prototype new homepage / hero designs without touching the live
// site. Once an experiment is approved, copy the relevant JSX into the real
// page (Dashboard.jsx, About.jsx, etc.) and remove it from here.
//
// To use the hero with your own image:
//   1. Save the image as /public/hero-vault.jpg (Vite serves /public from root)
//   2. Reload — the hero picks it up automatically.
//   3. If your image is differently shaped, tweak `bgPosition` below.
// ──────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

// Reference the file from /public so users can swap it without rebuilding.
// If the file isn't there yet, the gradient fallback still looks fine.
const HERO_IMG = '/hero-vault.jpg'

const OVERLAY_STYLES = {
  // Strong dark wash on the left, fading to clear on the right — for images
  // where the visual subject lives on the right side (like the vault shot).
  leftToClear: 'linear-gradient(to right, rgba(8,8,10,0.95) 0%, rgba(8,8,10,0.82) 35%, rgba(8,8,10,0.45) 60%, rgba(8,8,10,0) 90%)',
  // Vignette — dims all four edges, art reads in the center.
  vignette:    'radial-gradient(ellipse at center, rgba(8,8,10,0) 35%, rgba(8,8,10,0.6) 70%, rgba(8,8,10,0.92) 100%)',
  // Top-down — dark at top for headline, fades to bright at bottom.
  topDown:     'linear-gradient(to bottom, rgba(8,8,10,0.85) 0%, rgba(8,8,10,0.35) 50%, rgba(8,8,10,0) 100%)',
  // No overlay — for comparison.
  none:        'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 100%)',
}

const OVERLAY_LABELS = {
  leftToClear: 'Left → Clear',
  vignette:    'Vignette',
  topDown:     'Top-Down',
  none:        'None',
}

export default function Lab({ setPage }) {
  const [overlay,    setOverlay]    = useState('leftToClear')
  const [bgPosition, setBgPosition] = useState('right center')
  const [textAlign,  setTextAlign]  = useState('left')

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── Sandbox banner — always visible so you don't forget where you are ── */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(245,158,11,.18), rgba(245,158,11,.05))',
        borderBottom: '1px solid rgba(245,158,11,.4)',
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
        fontSize: '.78rem', color: 'var(--accent-gold)', fontWeight: 700,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🧪 Hero Lab</span>
          <span style={{ opacity: .6, fontWeight: 400 }}>
            Sandbox · changes here do not affect the live homepage
          </span>
        </div>
        <button
          onClick={() => setPage?.('dashboard')}
          style={{
            background: 'rgba(245,158,11,.15)', border: '1px solid rgba(245,158,11,.4)',
            color: 'var(--accent-gold)', padding: '5px 12px', borderRadius: 99,
            fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
          }}
        >← Back to Dashboard</button>
      </div>

      {/* ── HERO ── */}
      <section style={{
        position: 'relative',
        height: 'min(90vh, 780px)',
        minHeight: 480,
        overflow: 'hidden',
        background: '#08080a',
      }}>
        {/* Image layer */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage:    `url(${HERO_IMG})`,
          backgroundSize:     'cover',
          backgroundPosition: bgPosition,
          backgroundRepeat:   'no-repeat',
        }} />

        {/* Overlay gradient — makes left-side text readable */}
        <div style={{
          position: 'absolute', inset: 0,
          background: OVERLAY_STYLES[overlay],
          pointerEvents: 'none',
        }} />

        {/* Soft bottom fade into page bg so the hero blends with content below */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '20%',
          background: 'linear-gradient(to bottom, rgba(8,8,10,0) 0%, rgba(8,8,10,1) 100%)',
          pointerEvents: 'none',
        }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 2,
          height: '100%',
          display: 'flex', alignItems: 'center',
          padding: '0 clamp(20px, 6vw, 80px)',
          maxWidth: 1400, margin: '0 auto',
        }}>
          <div style={{
            maxWidth: 560, textAlign: textAlign,
            color: '#fff',
          }}>
            <div style={{
              fontSize: '.72rem', fontWeight: 800, letterSpacing: '.2em',
              textTransform: 'uppercase', color: 'var(--accent-teal)',
              marginBottom: 16,
            }}>
              ✦ Packs · Singles · Collection Tools
            </div>

            <h1 style={{
              fontSize: 'clamp(2.4rem, 6vw, 4.4rem)',
              fontWeight: 800, lineHeight: 1.02,
              letterSpacing: '-.02em',
              margin: '0 0 18px',
              textShadow: '0 4px 24px rgba(0,0,0,.6)',
            }}>
              Stock Better<br />
              <span style={{
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Singles.</span>
            </h1>

            <p style={{
              fontSize: 'clamp(.95rem, 1.6vw, 1.1rem)',
              color: 'rgba(255,255,255,.78)',
              lineHeight: 1.55,
              margin: '0 0 28px',
              maxWidth: 460,
            }}>
              Buy sealed mystery packs, track your collection at market value,
              and stay ahead of the meta — all in one place.
            </p>

            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              justifyContent: textAlign === 'center' ? 'center' : 'flex-start',
            }}>
              <button
                onClick={() => setPage?.('store')}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-gold) 0%, #f59e0b 100%)',
                  color: '#0a0a0c', border: 'none',
                  padding: '14px 28px', borderRadius: 99,
                  fontSize: '.92rem', fontWeight: 800,
                  cursor: 'pointer', letterSpacing: '.04em',
                  boxShadow: '0 8px 24px rgba(245,158,11,.35)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >🛒 Shop Singles</button>
              <button
                onClick={() => setPage?.('collection')}
                style={{
                  background: 'rgba(255,255,255,.08)',
                  color: '#fff',
                  border: '1.5px solid rgba(255,255,255,.25)',
                  padding: '14px 28px', borderRadius: 99,
                  fontSize: '.92rem', fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '.04em',
                  backdropFilter: 'blur(8px)',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >📊 Track Collection</button>
            </div>

            {/* Trust badges */}
            <div style={{
              display: 'flex', gap: 24, flexWrap: 'wrap',
              marginTop: 36, paddingTop: 24,
              borderTop: '1px solid rgba(255,255,255,.12)',
              justifyContent: textAlign === 'center' ? 'center' : 'flex-start',
            }}>
              {[
                ['🔍', 'Carefully Inspected', 'Quality cards, every time.'],
                ['🚚', 'Fast & Secure Shipping', 'Packaged with care.'],
                ['👤', 'Built by a Collector', 'For collectors, by a collector.'],
              ].map(([icon, title, sub]) => (
                <div key={title} style={{ minWidth: 130 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ color: 'var(--accent-gold)' }}>{icon}</span>
                    <span style={{ fontSize: '.7rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {title}
                    </span>
                  </div>
                  <div style={{ fontSize: '.66rem', color: 'rgba(255,255,255,.55)' }}>
                    {sub}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Hero controls (lab-only) ── */}
      <section style={{
        padding: '24px clamp(20px, 6vw, 80px) 60px',
        maxWidth: 1400, margin: '0 auto',
      }}>
        <div style={{
          fontSize: '.62rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '.15em', color: 'var(--text-muted)', marginBottom: 16,
        }}>
          🎛 Hero Controls
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {/* Overlay style */}
          <Control label="Overlay style">
            {Object.keys(OVERLAY_STYLES).map(k => (
              <ChipBtn key={k} active={overlay === k} onClick={() => setOverlay(k)}>
                {OVERLAY_LABELS[k]}
              </ChipBtn>
            ))}
          </Control>

          {/* Image position */}
          <Control label="Image position">
            {['left center', 'center', 'right center', 'right top', 'right bottom'].map(p => (
              <ChipBtn key={p} active={bgPosition === p} onClick={() => setBgPosition(p)}>
                {p}
              </ChipBtn>
            ))}
          </Control>

          {/* Text alignment */}
          <Control label="Text align">
            {['left', 'center'].map(a => (
              <ChipBtn key={a} active={textAlign === a} onClick={() => setTextAlign(a)}>
                {a}
              </ChipBtn>
            ))}
          </Control>
        </div>

        {/* Setup instructions */}
        <div style={{
          marginTop: 32, padding: '14px 18px',
          border: '1px dashed rgba(255,255,255,.15)', borderRadius: 12,
          background: 'rgba(255,255,255,.025)',
          fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <strong style={{ color: '#fff' }}>📁 To wire in your image:</strong>{' '}
          save it as <code style={{ background: 'rgba(255,255,255,.08)', padding: '1px 6px', borderRadius: 4 }}>public/hero-vault.jpg</code>
          {' '}in the repo, commit, and push. The hero picks it up on the next deploy.
          (You can also try other filenames — just update <code style={{ background: 'rgba(255,255,255,.08)', padding: '1px 6px', borderRadius: 4 }}>HERO_IMG</code> at the top of <code>src/pages/Lab.jsx</code>.)
        </div>
      </section>
    </div>
  )
}

// ── Small helpers used only inside the lab page ─────────────────────────────
function Control({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.12em', color: 'var(--text-muted)', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {children}
      </div>
    </div>
  )
}

function ChipBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 99,
        fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent-gold)' : 'rgba(255,255,255,.15)'}`,
        background: active ? 'rgba(245,158,11,.18)' : 'transparent',
        color: active ? 'var(--accent-gold)' : 'rgba(255,255,255,.6)',
        transition: 'all .15s',
      }}
    >{children}</button>
  )
}
