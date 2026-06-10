// ──────────────────────────────────────────────────────────────────────────────
// HeroLanding — welcome splash shown once per browser session in the content area.
//
// The artwork is a fully-composed image (headline, feature cards, and CTA buttons
// are all baked in). We render the whole image and overlay transparent click
// targets ("hotspots") on top of the baked-in buttons so they remain functional.
//
// Two crops of the same design are shipped: a landscape version for desktop/tablet
// and a portrait version for phones. We swap art + hotspot coordinates at the app's
// 900px breakpoint (where the sidebar gives way to the mobile nav).
//
// Renders as a normal page inside #content (sidebar and topbar stay visible).
// Dismissed by: clicking any hotspot, the ✕ button, or any sidebar nav link
// (the parent wires setPage to call onDismiss before navigating).
// ──────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'

// Each art crop carries its native size (to lock the image box's aspect ratio so
// hotspots line up) and its own hotspot map (positions differ between layouts).
const LANDSCAPE = {
  src: '/welcome-popup.png',
  w: 1448, h: 1086,
  hotspots: [
    { label: 'Go to Dashboard',                nav: 'dashboard',  left: '48.5%', top: '84.5%', width: '22.5%', height: '6.5%' },
    { label: 'Explore Store',                  nav: 'store',      left: '72.2%', top: '84.5%', width: '21%',   height: '6.5%' },
    { label: 'Learn more about Mana Mint Pro', nav: 'membership', left: '68%',   top: '92.5%', width: '18%',   height: '3%'   },
  ],
}

const PORTRAIT = {
  src: '/welcome-popup-portrait.png',
  w: 1086, h: 1448,
  hotspots: [
    { label: 'Go to Dashboard',                nav: 'dashboard',  left: '22%',   top: '87%',   width: '29%',   height: '5.5%' },
    { label: 'Explore Store',                  nav: 'store',      left: '51.5%', top: '87%',   width: '26.5%', height: '5.5%' },
    { label: 'Learn more about Mana Mint Pro', nav: 'membership', left: '47%',   top: '92.8%', width: '24%',   height: '3%'   },
  ],
}

// True when the viewport is narrower than the sidebar breakpoint (phone layout).
function useIsNarrow() {
  const query = '(max-width: 899px)'
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = e => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

export default function HeroLanding({ user, onNavigate, onAuthClick }) {
  const art = useIsNarrow() ? PORTRAIT : LANDSCAPE

  return (
    // Outer wrapper — fills the content pane, centers the artwork on a dark field
    // that matches the image's deep-navy background so any letterboxing is seamless.
    <div style={{
      position: 'relative',
      height: 'calc(100svh - 56px)',
      minHeight: 500,
      overflow: 'hidden',
      background: '#02152f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>

      {/* Image box — width is capped by BOTH the pane width and height so the whole
          composition is always visible while preserving aspect ratio. Hotspots are
          positioned as % of this box, so they track the baked-in buttons exactly. */}
      <div style={{
        position: 'relative',
        width: `min(100%, calc((100svh - 56px) * ${art.w} / ${art.h}))`,
        aspectRatio: `${art.w} / ${art.h}`,
      }}>
        <img
          src={art.src}
          alt="Welcome to Mana Mint — your all-in-one destination for Magic: The Gathering singles, collection tools, and premium repacks."
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        />

        {/* Transparent click targets sitting on top of the baked-in buttons. */}
        {art.hotspots.map(h => (
          <button
            key={h.label}
            onClick={() => onNavigate(h.nav)}
            aria-label={h.label}
            style={{
              ...hotspot,
              left: h.left, top: h.top, width: h.width, height: h.height,
            }}
          />
        ))}
      </div>

      {/* ── ✕ close → dashboard ── */}
      <button
        onClick={() => onNavigate('dashboard')}
        aria-label="Close and go to Dashboard"
        style={{
          position: 'absolute', top: 18, right: 18, zIndex: 10,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,.10)',
          border: '1.5px solid rgba(255,255,255,.28)',
          color: 'rgba(255,255,255,.85)',
          fontSize: '.95rem', fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(10px)',
          transition: 'background .15s, border-color .15s',
          lineHeight: 1,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background  = 'rgba(255,255,255,.22)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,.55)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background  = 'rgba(255,255,255,.10)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,.28)'
        }}
      >✕</button>
    </div>
  )
}

// Shared style for the transparent, clickable overlays sitting on baked-in buttons.
const hotspot = {
  position: 'absolute',
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
}
