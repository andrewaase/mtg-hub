const FEATURES = [
  {
    icon: '🛒',
    title: 'Card Shop',
    desc: 'Browse singles, sealed product, and curated resealed packs, all in one store. Filter by price range, condition, or foil status.',
    to: 'store',
  },
  {
    icon: '📦',
    title: 'Sealed & Resealed Products',
    desc: 'Pick up booster boxes, collector packs, and our exclusive resealed packs. Hand-curated surprises at every price point.',
    to: 'store',
  },
  {
    icon: '🔒',
    title: 'Secure Checkout',
    desc: 'Stripe-powered payments with flat-rate shipping. Inventory auto-decrements on purchase and a full itemized confirmation email goes out the moment your order is placed.',
  },
  {
    icon: '🔔',
    title: 'Restock Waitlist',
    desc: 'Sold out on something you want? Hit "Notify Me" and we\'ll email you the second it\'s back in stock. No account required.',
    to: 'store',
  },
  {
    icon: '📋',
    title: 'Collection Tracker',
    desc: 'Add cards by search or camera scan. Tap any card for full oracle text, type line, mana cost, flavor text, and live market value, all from one view.',
    to: 'collection',
  },
  {
    icon: '📈',
    title: 'Price History',
    desc: 'Every card in the store shows a 90-day price chart with 7-day change, all-time high, and all-time low. Your collection value is always up to date.',
    to: 'cards',
  },
  {
    icon: '🃏',
    title: 'Deck Builder',
    desc: 'Import Arena decklists, browse cards by type, and track the market value of every deck you own.',
    to: 'decks',
  },
  {
    icon: '⚔️',
    title: 'Match Log',
    desc: 'Log your games and track win rates by deck, format, and opponent. Know what\'s working.',
    to: 'log',
  },
  {
    icon: '🏷️',
    title: 'Sell Binder',
    desc: 'Add cards to your sell binder to see what stores are willing to pay you for them.',
    to: 'collection',
  },
  {
    icon: '❤️',
    title: 'Life Tracker',
    desc: 'Set up and keep track of your life totals while playing a game of Magic.',
    to: 'lifetracker',
  },
  {
    icon: '⭐',
    title: 'Wishlist',
    desc: 'Add cards to your wishlist and set a price target. Get notified the moment a card hits your target price.',
    to: 'wishlist',
  },
  {
    icon: '🔍',
    title: 'Card Lookup',
    desc: 'Search any card for rulings, format legality, set printings, and live prices. One click sends it straight to the shop to buy from us.',
    to: 'cards',
  },
  {
    icon: '📸',
    title: 'Camera Scanning',
    desc: 'Point your phone at a card and it\'s added to your collection instantly. No typing required.',
    to: 'collection',
  },
  {
    icon: '💰',
    title: 'Multiple Price Sources',
    desc: 'Compare prices across TCGPlayer, CardMarket, Card Kingdom, and Cardhoarder side by side.',
    to: 'cards',
  },
  {
    icon: '🤝',
    title: 'Friends & Trades',
    desc: 'Add friends, browse each other\'s collections, and coordinate trades directly in the app.',
    to: 'friends',
  },
  {
    icon: '📅',
    title: 'Set Releases',
    desc: 'Stay ahead of the curve with upcoming set release dates and spoiler tracking.',
    to: 'releases',
  },
  {
    icon: '📰',
    title: 'MTG News Feed',
    desc: 'The latest Magic news, announcements, and tournament results pulled in one place.',
    to: 'news',
  },
  {
    icon: '📊',
    title: 'Stats & Analytics',
    desc: 'Deep win-rate charts, color matchup breakdowns, and performance trends over any time range.',
    to: 'stats',
  },
  {
    icon: '🔄',
    title: 'Cross-Device Sync',
    desc: 'Sign in once and your collection, decks, wishlist, and match history follow you everywhere.',
  },
]

function FeatureCard({ icon, title, desc, to, onNavigate }) {
  const clickable = Boolean(to && onNavigate)
  return (
    <div
      onClick={clickable ? () => onNavigate(to) : undefined}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color .15s, box-shadow .15s',
        cursor: clickable ? 'pointer' : undefined,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(30,196,166,.45)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(30,196,166,.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'linear-gradient(135deg,#16a389,#3dd6ba)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.25rem', flexShrink: 0,
        }}>
          {icon}
        </div>
        {clickable && (
          <span style={{ color: 'rgba(30,196,166,.5)', fontSize: '.75rem', marginTop: 2 }}>→</span>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: 5, color: 'var(--text-primary)' }}>
          {title}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '.78rem', lineHeight: 1.65 }}>
          {desc}
        </div>
      </div>
    </div>
  )
}

export default function About({ setPage }) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>

      {/*  Hero  */}
      <div style={{
        background: 'linear-gradient(135deg,#0f172a 0%,#1a1200 100%)',
        borderRadius: 16, padding: '40px 32px', marginBottom: 28,
        border: '1px solid rgba(30,196,166,.2)',
        boxShadow: '0 4px 24px rgba(30,196,166,.08)',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '.62rem', fontWeight: 700, letterSpacing: '.18em',
          color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 12,
        }}>
          Our Story
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0 0 14px', lineHeight: 1.2, color: 'var(--text-primary)' }}>
          Built by an MTG player,<br />for MTG players.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.92rem', lineHeight: 1.75, maxWidth: 560, margin: '0 auto' }}>
          Mana Mint started as a personal project to solve a real problem. I had a favorite app that I
          used for all my card and price lookups — one I had already paid for. Then it was moved behind
          a monthly subscription paywall. Rather than pay up, I got fed up and decided to build my own
          card lookup app. As I kept building, more ideas came, and I kept adding them to Mana Mint. The
          result is a comprehensive, intuitive Magic: The Gathering assistant that tracks everything from
          your collection to your daily matches.
        </p>
      </div>

      {/*  Story  */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '24px',
        marginBottom: 28, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 14px', color: 'var(--accent-gold)' }}>
          The Story
        </h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: '.9rem', lineHeight: 1.8 }}>
          <p style={{ margin: '0 0 12px' }}>
            Magic: The Gathering has been a huge part of my life for a long time. I was introduced to the
            game when I was 12 or 13. I still remember walking into a card shop and looking at all the
            singles — it had to be right around the time the original Lorwyn set dropped, because I remember
            staring at rows of Lorwyn and Morningtide cards.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            The first card I ever bought was Deathrender. I had no idea how to play it or even what it did,
            but I had to have it. For my first Standard tournament, I bought a UR Eventide precon, convinced
            I was going to take down the competition.
          </p>
          <p style={{ margin: 0 }}>
            Since then, I've played in countless FNMs, won multiple Magic Game Days, and even competed in a
            Grand Prix. I've always wanted to run a Magic store — it was never a matter of if, only when.
            That's how Mana Mint was born.
          </p>
        </div>
      </div>

      {/*  Features  */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            fontSize: '.62rem', fontWeight: 700, letterSpacing: '.18em',
            color: 'var(--accent-gold)', textTransform: 'uppercase', marginBottom: 8,
          }}>
            Everything you need
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            All your MTG tools, in one place.
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
        }}>
          {FEATURES.map(f => <FeatureCard key={f.title} {...f} onNavigate={setPage} />)}
        </div>
      </div>

      {/*  Why buy here  */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, padding: '24px',
        marginBottom: 16, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--accent-gold)' }}>
          Why Buy From Mana Mint?
        </h2>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '.88rem', lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
          <li>Prices updated daily using live Scryfall market data</li>
          <li>Every card inspected and graded honestly. NM means NM</li>
          <li>Flat-rate $4.99 shipping, carefully packaged in sleeves and toploaders</li>
          <li>Order confirmation email sent the moment your payment clears</li>
          <li>Singles, sealed product, and exclusive resealed packs all in one place</li>
          <li>Out-of-stock? Join the waitlist and we'll notify you when it's back</li>
          <li>Real collector behind every listing, not a faceless warehouse</li>
          <li>Questions? You'll get a real reply, fast</li>
        </ul>
      </div>

      {/*  Contact  */}
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
          href="mailto:manamintmtg@gmail.com"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'rgba(30,196,166,.12)', color: 'var(--accent-gold)',
            border: '1px solid rgba(30,196,166,.3)', fontWeight: 700, fontSize: '.85rem',
            textDecoration: 'none',
          }}
        >
           manamintmtg@gmail.com
        </a>
      </div>

    </div>
  )
}
