// src/pages/Support.jsx
// Support & Help page — accessible at /#support

const CONTACT_EMAIL = 'manamintmtg@gmail.com'

export default function Support({ setPage }) {
  const section = (title) => (
    <h2 style={{
      fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)',
      margin: '36px 0 10px', paddingTop: 36,
      borderTop: '1px solid var(--border)',
      letterSpacing: '.01em',
    }}>{title}</h2>
  )

  const p = (text) => (
    <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.75, margin: '0 0 12px' }}>
      {text}
    </p>
  )

  const faqs = [
    {
      q: 'How do I scan a card?',
      a: 'Tap the camera icon in the bottom navigation bar. Point your camera at the card and hold steady — the scanner will identify the card automatically. Make sure the card name is clearly visible and the lighting is good.',
    },
    {
      q: 'Why is my scan not working?',
      a: 'Ensure camera permissions are enabled for Mana Mint in your device Settings. Try scanning in better lighting and make sure the card name is not obscured. Foreign language cards (Japanese, etc.) are supported — the scanner will find the English version.',
    },
    {
      q: 'How many scans do I get on the free plan?',
      a: 'Free accounts get 100 card scans per day. Mana Mint Pro gives you unlimited scans.',
    },
    {
      q: 'How do I upgrade to Pro?',
      a: 'Go to the Membership page from the sidebar or menu. On iOS you can subscribe directly through Apple. On the web, subscriptions are handled via Stripe.',
    },
    {
      q: 'How do I cancel my subscription?',
      a: 'On iOS: go to Settings → Apple ID → Subscriptions → Mana Mint Pro → Cancel. On web: go to Membership → Manage Billing to access the Stripe portal.',
    },
    {
      q: 'How do I restore a previous purchase?',
      a: 'On iOS, go to the Membership page and tap "Restore purchases" at the bottom. This will restore any active subscription tied to your Apple ID.',
    },
    {
      q: 'How do I delete my account?',
      a: 'Tap your profile / Account icon → scroll to the bottom → "Delete account". This permanently deletes all your data including your collection, decks, wishlist, and match history. This action cannot be undone.',
    },
    {
      q: 'Are card prices real-time?',
      a: 'Prices are sourced from TCGPlayer and other market data providers via Scryfall. They are updated regularly but may not reflect real-time buylist or store prices.',
    },
    {
      q: 'Can I use Mana Mint on multiple devices?',
      a: 'Yes — sign in with the same account on any device and your collection, decks, and data will sync automatically.',
    },
    {
      q: 'What formats does the deck builder support?',
      a: 'You can build and track decks for any format — Standard, Modern, Pioneer, Commander, Legacy, Vintage, and more. Format legality checking is displayed for each card.',
    },
  ]

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => setPage?.('dashboard')}
          style={{
            background: 'none', border: 'none', color: 'var(--accent-gold)',
            fontSize: '.8rem', cursor: 'pointer', padding: 0, marginBottom: 24,
            letterSpacing: '.03em', fontWeight: 600,
          }}
        >
          ← Back to Mana Mint
        </button>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
          Help & Support
        </h1>
        <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Need help with Mana Mint? Browse the FAQ below or reach out directly.
        </p>
      </div>

      {/* Contact card */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid rgba(30,196,166,.3)',
        borderRadius: 12, padding: '20px 24px', marginTop: 24, marginBottom: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 4 }}>Contact Support</div>
          <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>We typically respond within 1–2 business days.</div>
        </div>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          style={{
            background: 'var(--accent-gold)', color: '#1a1000', fontWeight: 700,
            fontSize: '.85rem', padding: '8px 20px', borderRadius: 8,
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >
          Email Us
        </a>
      </div>
      <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 0 }}>{CONTACT_EMAIL}</p>

      {section('Frequently Asked Questions')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {faqs.map((faq, i) => (
          <details
            key={i}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)',
              borderRadius: 8, overflow: 'hidden',
            }}
          >
            <summary style={{
              padding: '14px 18px', fontWeight: 600, fontSize: '.88rem',
              cursor: 'pointer', listStyle: 'none', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
              userSelect: 'none',
            }}>
              {faq.q}
              <span style={{ color: 'var(--text-muted)', fontSize: '.75rem', marginLeft: 12, flexShrink: 0 }}>▾</span>
            </summary>
            <div style={{ padding: '0 18px 14px', fontSize: '.85rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {faq.a}
            </div>
          </details>
        ))}
      </div>

      {section('About Mana Mint')}
      {p('Mana Mint is an independent Magic: The Gathering collection and deck management tool. We are not affiliated with Wizards of the Coast or Hasbro.')}
      {p(`For bug reports, feature requests, or general feedback, email us at ${CONTACT_EMAIL}.`)}

    </div>
  )
}
