import { useState } from 'react'
import { META_DATA, BRAWL_TRENDING_FALLBACK } from '../data/meta'

export default function MetaTracker({ openDecklist, openAddCard }) {
  const [format, setFormat] = useState('standard')

  const data = META_DATA[format]
  const tierColors = { S: 'tier-s', A: 'tier-a', B: 'tier-b', C: 'tier-c' }
  const tierPillStyles = {
    S: { background: 'rgba(255,215,0,.2)', color: '#ffd700' },
    A: { background: 'rgba(201,168,76,.2)', color: 'var(--accent-gold)' },
    B: { background: 'rgba(74,144,217,.15)', color: 'var(--accent-blue)' },
    C: { background: 'rgba(155,89,182,.15)', color: '#c07de0' },
  }

  return (
    <div>
      <div className="tabs">
        {['standard', 'modern', 'legacy', 'brawl'].map(f => (
          <button key={f} className={`tab ${format === f ? 'active' : ''}`} onClick={() => setFormat(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="meta-info-bar">
        ⚠️ Meta data is approximate — see <a href="https://www.mtggoldfish.com" target="_blank" rel="noopener noreferrer">MTGGoldfish</a> for live metagame breakdowns.
      </div>

      <div className="meta-layout full">
        {data.tiers.map((tier, i) => (
          <div key={i} className="tier-block">
            <div className={`tier-label ${tierColors[tier.tier]}`}>{tier.label}</div>
            <div className="meta-deck-grid">
              {tier.decks.map((deck, j) => (
                <div key={j} className="meta-deck-card">
                  <div className="meta-deck-header">
                    <div className="meta-deck-name">{deck.name}</div>
                    <span className="meta-tier-pill" style={tierPillStyles[tier.tier]}>Tier {tier.tier}</span>
                  </div>
                  <div className="meta-colors">{deck.colors}</div>
                  <div className="meta-tags">
                    <span className="badge badge-deck">{deck.arch}</span>
                    <span className="meta-pct">{deck.pct}</span>
                  </div>
                  <div className="meta-key-cards"><strong>Key:</strong> {deck.keys}</div>
                  <div className="meta-links">
                    <button className="btn btn-primary btn-sm" onClick={() => openDecklist(deck.name)} style={{ fontSize: '.72rem' }}>📋 Deck</button>
                    <a href={deck.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: '.72rem' }}>
                      {format === 'brawl' ? 'EDHREC' : 'MTGGoldfish'} ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
