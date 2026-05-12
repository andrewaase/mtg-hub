import { useEffect, useState } from 'react'

// Detect toast "type" from the message text/emoji so callers don't need to change
function detectType(msg) {
  if (!msg) return 'info'
  const m = String(msg)
  if (/✅|✓|saved|added|updated|synced|imported|done|success/i.test(m)) return 'success'
  if (/❌|error|failed|couldn't|could not|invalid/i.test(m)) return 'error'
  if (/⚠️|warning|limit|upgrade|sign in|pro/i.test(m)) return 'warning'
  if (/🎯|alert|target|at target/i.test(m)) return 'target'
  return 'info'
}

const TYPE_STYLES = {
  success: { accent: '#4ade80', bg: 'rgba(74,222,128,.1)',  border: 'rgba(74,222,128,.3)',  icon: '✓'  },
  error:   { accent: '#f87171', bg: 'rgba(248,113,113,.1)', border: 'rgba(248,113,113,.3)', icon: '✕'  },
  warning: { accent: '#fbbf24', bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.3)',  icon: '⚠'  },
  target:  { accent: '#3ecfb2', bg: 'rgba(62,207,178,.1)',  border: 'rgba(62,207,178,.3)',  icon: '🎯' },
  info:    { accent: '#94a3b8', bg: 'rgba(148,163,184,.08)', border: 'rgba(148,163,184,.2)', icon: 'ℹ'  },
}

export default function Toast({ msg }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!msg) { setVisible(false); return }
    // Tiny delay so the browser paints the initial state before animating in
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [msg])

  if (!msg) return null

  const type = detectType(msg)
  const s    = TYPE_STYLES[type] || TYPE_STYLES.info

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '90px',
        right: '20px',
        zIndex: 1100,
        maxWidth: '320px',
        width: 'calc(100vw - 40px)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 14px',
        background: `linear-gradient(135deg, #1a1a1e, #141418)`,
        border: `1px solid ${s.border}`,
        borderLeft: `3px solid ${s.accent}`,
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,.6)',
        // Slide-up + fade
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
        transition: 'opacity .22s ease, transform .22s ease',
        pointerEvents: 'none',
      }}
    >
      {/* Icon pill */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: s.bg, border: `1px solid ${s.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: type === 'target' ? '.7rem' : '.65rem',
        color: s.accent, flexShrink: 0, fontWeight: 800,
        marginTop: '1px',
      }}>
        {s.icon}
      </div>
      {/* Message */}
      <div style={{ fontSize: '.84rem', color: '#e2e8f0', lineHeight: 1.45, flex: 1, minWidth: 0 }}>
        {msg}
      </div>
    </div>
  )
}
