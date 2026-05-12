// src/components/OnboardingTutorial.jsx
// Step-by-step guided tour for new users shown after first sign-up.
// Walks through: Dashboard → Card Lookup → Collection → Decks → Wishlist → Match Log → Store
import { useState } from 'react'

const STEPS = [
  {
    page:  'dashboard',
    icon:  '🏠',
    title: 'Welcome to Vaulted Singles!',
    body:  "This is your Dashboard — a quick overview of your collection value, recent price changes, and format staples. It updates automatically as you add cards.",
    cta:   'Next: Find Cards',
  },
  {
    page:  'cards',
    icon:  '🔍',
    title: 'Look Up Any Card',
    body:  'Search for any Magic card to see current prices, set info, rulings, and format legality. Click "Add to Collection" or "Buy" right from the card detail view.',
    cta:   'Next: My Collection',
  },
  {
    page:  'collection',
    icon:  '📦',
    title: 'Build Your Collection',
    body:  'Add cards manually or scan them with your camera. Your collection value is tracked daily so you can watch it grow over time.',
    cta:   'Next: Sell Tab',
  },
  {
    page:  'collection',
    icon:  '💰',
    title: 'Know What to Sell',
    body:  "Tap the Sell tab inside your collection. Each card shows live buylist prices from top vendors so you know exactly what it's worth to sell today. Cards flagged with a signal have strong sell indicators — high buylist-to-market ratios, price spikes, or low reprint risk.",
    cta:   'Next: My Decks',
  },
  {
    page:  'decks',
    icon:  '📚',
    title: 'Build & Track Decks',
    body:  'Import a decklist from Arena, MTGO, or Moxfield — or build one from scratch. Vaulted Singles automatically values your deck and highlights cards you already own.',
    cta:   'Next: Hand Simulator',
  },
  {
    page:  'decks',
    icon:  '🃏',
    title: 'Hand Simulator & Solitaire',
    body:  "Open any deck and hit Simulate Hand to draw a 7-card opening hand. Mulligan as many times as you want to test consistency. Use Deck Solitaire to play through your early turns and see how your deck goldfishes before taking it to a real match.",
    cta:   'Next: Buy a Deck',
  },
  {
    page:  'decks',
    icon:  '🛍️',
    title: 'Buy the Whole Deck',
    body:  "Don't own the cards yet? Click any Buy Deck button and we'll build you an optimized cart with every card you're missing — sourced from TCGplayer or ManaPool. One click to go from decklist to checkout.",
    cta:   'Next: Wishlist',
  },
  {
    page:  'wishlist',
    icon:  '⭐',
    title: 'Track Cards You Want',
    body:  "Add cards to your Wishlist and set a target price. You'll get an alert on your dashboard when a card drops to your target.",
    cta:   'Next: Match Log',
  },
  {
    page:  'log',
    icon:  '🎮',
    title: 'Log Your Matches',
    body:  "Track wins and losses by deck and format. Head to the Stats page to see your win rates, best matchups, and performance over time.",
    cta:   'Next: The Store',
  },
  {
    page:  'store',
    icon:  '🛒',
    title: 'Buy Singles From Us',
    body:  "Browse our store for NM and graded MTG singles at fair, daily-updated prices. Every $20 you spend earns you a free month of Pro!",
    cta:   "Let's go! 🚀",
  },
]

export default function OnboardingTutorial({ setPage, onDone }) {
  const [step, setStep]       = useState(0)
  const [exiting, setExiting] = useState(false)

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  const advance = () => {
    if (isLast) {
      // Navigate to the last step's page before finishing
      setPage(current.page)
      finish()
    } else {
      const next = STEPS[step + 1]
      setPage(next.page)   // go to the page the NEXT step is about
      setStep(s => s + 1)
    }
  }

  const finish = () => {
    setExiting(true)
    setTimeout(() => {
      localStorage.setItem('vs-onboarding-done', '1')
      onDone?.()
    }, 300)
  }

  const skip = () => {
    localStorage.setItem('vs-onboarding-done', '1')
    onDone?.()
  }

  return (
    <div
      style={{
        position: 'fixed', bottom: '80px', right: '20px', zIndex: 1200,
        width: '320px',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity .3s, transform .3s',
        pointerEvents: exiting ? 'none' : 'auto',
      }}
    >
      <div style={{
        background: '#1a1a1e',
        border: '1px solid rgba(201,168,76,.4)',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,.8)',
        overflow: 'hidden',
      }}>
        {/* Gold accent bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, var(--accent-gold), #f59e0b)' }} />

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '5px', padding: '14px 16px 0', justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? '18px' : '6px', height: '6px', borderRadius: '99px',
                transition: 'width .2s, background .2s',
                background: i === step ? '#c9a84c' : i < step ? 'rgba(201,168,76,.4)' : 'rgba(255,255,255,.15)',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 18px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>{current.icon}</span>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#f1f5f9' }}>
              {current.title}
            </div>
          </div>
          <p style={{
            fontSize: '.82rem', color: '#94a3b8', lineHeight: 1.6,
            margin: '0 0 16px',
          }}>
            {current.body}
          </p>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={skip}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '.75rem', color: '#64748b', padding: '6px 0',
                flexShrink: 0,
              }}
            >
              Skip tour
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-primary"
              style={{
                fontSize: '.8rem', padding: '7px 16px',
                background: 'var(--accent-gold)', color: '#1a1000', fontWeight: 700,
              }}
              onClick={advance}
            >
              {current.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
