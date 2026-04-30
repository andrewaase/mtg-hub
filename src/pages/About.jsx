const FEATURES = [
  {
    icon: '🏪',
    title: 'Card Shop',
    desc: 'Buy MTG singles at fair, daily-updated prices. Every listing inspected and graded honestly.',
  },
  {
    icon: '📦',
    title: 'Collection Tracker',
    desc: 'Add cards by search or camera scan. Your collection value updates automatically.',
  },
  {
    icon: '📈',
    title: 'Price History',
    desc: 'See how your portfolio value changes over time with daily snapshots and trend charts.',
  },
  {
    icon: '🃏',
    title: 'Deck Builder',
    desc: 'Import Arena decklists, browse cards by type, and track the market value of every deck you own.',
  },
  {
    icon: '⚔️',
    title: 'Match Log',
    desc: 'Log your games and track win rates by deck, format, and opponent. Know what\'s working.',
  },
  {
    icon: '🎯',
    title: 'Wishlist & Price Alerts',
    desc: 'Set a target price on any card and get alerted the moment it drops to your number.',
  },
  {
    icon: '🔍',
    title: 'Card Lookup',
    desc: 'Search any card for rulings, format legality, set printings, and live prices from multiple markets.',
  },
  {
    icon: '📸',
    title: 'Camera Scanning',
    desc: 'Point your phone at a card and it\'s added to your collection instantly — no typing required.',
  },
  {
    icon: '💰',
    title: 'Multiple Price Sources',
    desc: 'Compare prices across TCGPlayer, CardMarket, Card Kingdom, and Cardhoarder side by side.',
  },
  {
    icon: '👥',
    title: 'Friends & Trades',
    desc: 'Add friends, browse each other\'s collections, and coordinate trades directly in the app.',
  },
  {
    icon: '📅',
    title: 'Set Releases',
    desc: 'Stay ahead of the curve with upcoming set release dates and spoiler tracking.',
  },
  {
    icon: '📰',
    title: 'MTG News Feed',
    desc: 'The latest Magic news, announcements, and tournament results pulled in one place.',
  },
  {
    icon: '📊',
    title: 'Stats & Analytics',
    desc: 'Deep win-rate charts, color matchup breakdowns, and performance trends over any time range.',
  },
  {
    icon: '☁️',
    title: 'Cross-Device Sync',
    desc: 'Sign in once and your collection, decks, wishlist, and match history follow you everywhere.',
  },
]

function FeatureCard({ icon, title, desc }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '20px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'border-color .15s, box-shadow .15s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(201,168,76,.45)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(201,168,76,.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Icon box */}
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: 'linear-gradient(135deg,#c9a84c,#f0c060)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.25rem', flexShrink: 0,
      }}>
        {icon}
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 5, color: '#f1f5f9' }}>
          {title}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', lineHeight: 1.65 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

export default function About() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg,#0f172a 0%,#1a1200 100%)',
        borderRadius: 16, padding: '40px 32px', marginBottom: 28,
        border: '1px solid rgba(201,168,76,.2)',
        boxShadow: '0 4px 24px rgba(201,168,76,.08)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '.62rem', fontWeight: 700, letterSpacing: '.18em',
          color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 12,
        }}>
          Our Story
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.2, color: '#f1f5f9' }}>
          Built by an MTG player,<br />for MTG players.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.92rem', lineHeight: 1.75, maxWidth: 560, margin: '0 auto' }}>
          Vaulted Singles started as a personal project to solve a real problem: keeping track of a growing
          Magic: The Gathering collection and making it easy to buy and sell singles at fair prices.
        </p>
      </div>

      {/* ── Story ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '24px',
        marginBottom: 28, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 14px', color: 'var(--accent-gold)' }}>
          The Story
        </h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: '.9rem', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 12px' }}>
            Magic: The Gathering has been a part of my life for years — the strategy, the art, the community,
            and yes, the hunt for that one card that completes the deck. Over time my collection grew to the
            point where I needed a better way to manage it, price it, and eventually start selling.
          </p>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            ✏️ <strong>Placeholder</strong> — add your real story here: how you got into Magic, when you started collecting,
            what gap Vaulted Singles fills for you, and why you opened the shop.
          </p>
        </div>
      </div>

      {/* ── Features ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            fontSize: '.62rem', fontWeight: 700, letterSpacing: '.18em',
            color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 8,
          }}>
            Everything you need
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: '#f1f5f9' }}>
            All your MTG tools, in one place.
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {FEATURES.map(f => <FeatureCard key={f.title} {...f} />)}
        </div>
      </div>

      {/* ── Why buy here ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '24px',
        marginBottom: 16, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--accent-gold)' }}>
          Why Buy From Vaulted Singles?
        </h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '.88rem', lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
          <li>Prices updated daily using live Scryfall market data</li>
          <li>Every card inspected and graded honestly — NM means NM</li>
          <li>Fast shipping, carefully packaged in sleeves and toploaders</li>
          <li>Real collector behind every listing — not a faceless warehouse</li>
          <li>Questions? You'll get a real reply, fast</li>
        </ul>
      </div>

      {/* ── Contact ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '22px 24px',
        border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 10px', color: 'var(--accent-gold)' }}>
          Get in Touch
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '.88rem', lineHeight: 1.65, margin: '0 0 14px' }}>
          Have questions about an order, a card you're hunting for, or just want to talk MTG?
          We'd love to hear from you.
        </p>
        <a
          href="mailto:mtgvaultedsingles@gmail.com"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'rgba(201,168,76,.12)', color: 'var(--accent-gold)',
            border: '1px solid rgba(201,168,76,.3)', fontWeight: 700, fontSize: '.85rem',
            textDecoration: 'none',
          }}
        >
          📧 mtgvaultedsingles@gmail.com
        </a>
      </div>

    </div>
  )
}
