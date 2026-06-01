// src/components/UpgradeModal.jsx
// Shown when a free user hits a limit (scan cap, deck cap, hand simulator, etc.)
// Clicking Upgrade redirects them to the Membership page.
export default function UpgradeModal({ reason = 'feature', onClose, setPage }) {
  const REASONS = {
    scan: {
      icon:  '',
      title: "You've hit your daily scan limit",
      body:  "Free accounts can scan 100 cards per day. Upgrade to Pro for unlimited scanning — every day, forever.",
      cta:   'Upgrade to Pro',
    },
    deck: {
      icon:  '',
      title: "Free accounts are limited to 10 decks",
      body:  "You've reached the 10-deck limit for free accounts. Go Pro to build unlimited decks.",
      cta:   'Upgrade to Pro',
    },
    hand: {
      icon:  '',
      title: 'Hand Simulator is a Pro feature',
      body:  "Simulate opening hands and mulligans with any deck in your library. Upgrade to Pro to unlock it.",
      cta:   'Unlock Hand Simulator',
    },
    generic: {
      icon:  '',
      title: 'This is a Pro feature',
      body:  "Upgrade to Mana Mint Pro for unlimited scans, unlimited decks, hand simulator, and more.",
      cta:   'View Pro Plans',
    },
  }

  const content = REASONS[reason] || REASONS.generic

  const handleUpgrade = () => {
    onClose()
    setPage('membership')
  }

  return (
    <div className="auth-modal open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{content.icon}</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
            {content.title}
          </div>
          <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {content.body}
          </div>
        </div>

        {/* Pro feature highlights */}
        <div style={{
          background: 'rgba(30,196,166,.06)', border: '1px solid rgba(30,196,166,.2)',
          borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
        }}>
          {[
            ' Unlimited card scans',
            ' Unlimited decks',
            ' Hand simulator & mulligans',
            ' Priority support',
          ].map(f => (
            <div key={f} style={{ fontSize: '.82rem', color: 'var(--accent-gold)', marginBottom: '6px', fontWeight: 600 }}>
              {f}
            </div>
          ))}
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
            From $2.99 / month · Cancel anytime
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Maybe later</button>
          <button
            className="btn btn-primary"
            onClick={handleUpgrade}
            style={{ background: 'var(--accent-gold)', color: '#1a1000', fontWeight: 700 }}
          >
            {content.cta}
          </button>
        </div>
      </div>
    </div>
  )
}
