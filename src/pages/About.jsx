export default function About() {
  const features = [
    { icon: '🏪', title: 'Card Shop',         desc: 'Browse and buy MTG singles at fair, market-updated prices — every card refreshed daily.' },
    { icon: '📦', title: 'Collection Tracker', desc: 'Scan cards with your phone camera and watch your collection value update in real time.' },
    { icon: '📈', title: 'Price Tracking',     desc: 'Track how card prices move over time. Know exactly when to buy, sell, or hold.' },
    { icon: '🃏', title: 'Deck Builder',       desc: 'Build and manage decks with format-staple suggestions pulled from current metagame data.' },
    { icon: '⚔️', title: 'Match Log',          desc: 'Log your games and get win-rate stats broken down by deck, format, and opponent.' },
    { icon: '🎯', title: 'Wishlist & Alerts',  desc: 'Set a target price on any card and get notified when it drops to your number.' },
  ]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingBottom: 80 }}>

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(135deg,#0f172a 0%,#1a1200 100%)',
        borderRadius: 16, padding: '36px 28px', marginBottom: 20,
        border: '1px solid rgba(201,168,76,.2)',
        boxShadow: '0 4px 24px rgba(201,168,76,.08)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: '.18em', color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 10 }}>
          Our Story
        </div>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.2, color: '#f1f5f9' }}>
          Built by an MTG player,<br />for MTG players.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.92rem', lineHeight: 1.75, maxWidth: 520, margin: '0 auto' }}>
          Vaulted Singles started as a personal project to solve a real problem: keeping track of a growing
          Magic: The Gathering collection and making it easy to buy and sell singles at fair prices.
        </p>
      </div>

      {/* ── Story (placeholder — fill this in!) ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '24px',
        marginBottom: 16, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 14, color: 'var(--accent-gold)', margin: '0 0 14px' }}>
          The Story
        </h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: '.9rem', lineHeight: 1.8 }}>
          {/* ── TODO: Replace the paragraph below with your personal story ── */}
          <p style={{ margin: '0 0 12px' }}>
            Magic: The Gathering has been a part of my life for years — the strategy, the art, the community,
            and yes, the hunt for that one card that completes the deck. Over time my collection grew to the
            point where I needed a better way to manage it, price it, and eventually start selling.
          </p>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {/* Remove this italic paragraph once you've written your real story */}
            ✏️ <strong>Placeholder</strong> — add your real story here: how you got into Magic, when you started collecting,
            what gap Vaulted Singles fills for you, and why you opened the shop.
            The more personal and specific, the better — it's what makes the site feel human.
          </p>
        </div>
      </div>

      {/* ── What we offer ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '24px',
        marginBottom: 16, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 16px', color: 'var(--accent-gold)' }}>
          What We Offer
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: 'var(--bg-primary)', borderRadius: 10, padding: '14px',
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 7 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 5 }}>{f.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '.75rem', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
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
