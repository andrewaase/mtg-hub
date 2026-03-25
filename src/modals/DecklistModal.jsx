import { DECKLISTS } from '../data/decklists'

export default function DecklistModal({ deck, onClose, setPage }) {
  const deckData = DECKLISTS[deck]

  if (!deckData) return null

  const allCards = [
    ...(deckData.creatures || []),
    ...(deckData.spells || []),
    ...(deckData.planeswalkers || []),
    ...(deckData.lands || []),
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
      <div className="decklist-box">
        <div className="decklist-header">
          <div>
            <h3>{deck}</h3>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              {deckData.format} · {deckData.tier}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>

        <div className="decklist-body">
          <div className="decklist-sidebar">
            <div className="dl-section">
              <div className="dl-section-title">Creatures</div>
              {(deckData.creatures || []).map(([qty, name], i) => (
                <div key={i} className="dl-card-row">
                  <span className="dl-qty">{qty}</span>
                  <span className="dl-card-name">{name}</span>
                </div>
              ))}
            </div>

            <div className="dl-section">
              <div className="dl-section-title">Spells</div>
              {(deckData.spells || []).map(([qty, name], i) => (
                <div key={i} className="dl-card-row">
                  <span className="dl-qty">{qty}</span>
                  <span className="dl-card-name">{name}</span>
                </div>
              ))}
            </div>

            {(deckData.planeswalkers || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">Planeswalkers</div>
                {deckData.planeswalkers.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="dl-section">
              <div className="dl-section-title">Lands</div>
              {(deckData.lands || []).map(([qty, name], i) => (
                <div key={i} className="dl-card-row">
                  <span className="dl-qty">{qty}</span>
                  <span className="dl-card-name">{name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="decklist-main">
            <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {deckData.note}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <a href={deckData.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                MTGGoldfish ↗
              </a>
            </div>
          </div>
        </div>

        <div className="decklist-footer">
          <span className="dl-card-count">{allCards.reduce((a, [q]) => a + q, 0)} cards</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
