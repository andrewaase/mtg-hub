import { DECKLISTS } from '../data/decklists'

const COMMANDER_FORMATS = ['Commander', 'Brawl', 'Historic Brawl']

export default function DecklistModal({ deck, onClose, setPage }) {
  const deckData = DECKLISTS[deck]
  if (!deckData) return null

  const isCmdr = COMMANDER_FORMATS.includes(deckData.format)

  const mainCards = [
    ...(deckData.creatures     || []),
    ...(deckData.spells        || []),
    ...(deckData.artifacts     || []),
    ...(deckData.enchantments  || []),
    ...(deckData.planeswalkers || []),
    ...(deckData.lands         || []),
  ]
  const sideCards = deckData.sideboard || []

  const mainCount = mainCards.reduce((a, [q]) => a + q, 0)
  const sideCount = sideCards.reduce((a, [q]) => a + q, 0)
  const cmdrCount = deckData.commander ? 1 : 0
  const total     = mainCount + cmdrCount + sideCount

  // Expected totals by format
  const expectedMain = isCmdr ? 99 : 60
  const expectedSide = isCmdr ? 0  : 15

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' }}>
      <div className="decklist-box">

        {/* Header */}
        <div className="decklist-header">
          <div>
            <h3>{deck}</h3>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              {deckData.format} · {deckData.tier}
              {' · '}
              <span style={{ color: total === (isCmdr ? 100 : 75) ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                {total} cards
              </span>
              {sideCount > 0 && <span style={{ color: 'var(--text-muted)' }}> ({sideCount} SB)</span>}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>

        {/* Body */}
        <div className="decklist-body">
          <div className="decklist-sidebar">

            {/* Commander section */}
            {isCmdr && deckData.commander && (
              <div className="dl-section">
                <div className="dl-section-title" style={{ color: 'var(--accent-gold)' }}>Commander</div>
                <div className="dl-card-row" style={{ borderLeft: '2px solid var(--accent-gold)', paddingLeft: '8px' }}>
                  <span className="dl-qty">1</span>
                  <span className="dl-card-name">{deckData.commander}</span>
                </div>
              </div>
            )}

            {/* Creatures */}
            {(deckData.creatures || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">
                  Creatures ({deckData.creatures.reduce((a, [q]) => a + q, 0)})
                </div>
                {deckData.creatures.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Spells */}
            {(deckData.spells || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">
                  Instants / Sorceries ({deckData.spells.reduce((a, [q]) => a + q, 0)})
                </div>
                {deckData.spells.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Artifacts */}
            {(deckData.artifacts || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">
                  Artifacts ({deckData.artifacts.reduce((a, [q]) => a + q, 0)})
                </div>
                {deckData.artifacts.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Enchantments */}
            {(deckData.enchantments || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">
                  Enchantments ({deckData.enchantments.reduce((a, [q]) => a + q, 0)})
                </div>
                {deckData.enchantments.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Planeswalkers */}
            {(deckData.planeswalkers || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">
                  Planeswalkers ({deckData.planeswalkers.reduce((a, [q]) => a + q, 0)})
                </div>
                {deckData.planeswalkers.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Lands */}
            {(deckData.lands || []).length > 0 && (
              <div className="dl-section">
                <div className="dl-section-title">
                  Lands ({deckData.lands.reduce((a, [q]) => a + q, 0)})
                </div>
                {deckData.lands.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Sideboard */}
            {sideCards.length > 0 && (
              <div className="dl-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '8px' }}>
                <div className="dl-section-title" style={{ color: 'var(--accent-blue)' }}>
                  Sideboard ({sideCount})
                </div>
                {sideCards.map(([qty, name], i) => (
                  <div key={i} className="dl-card-row">
                    <span className="dl-qty">{qty}</span>
                    <span className="dl-card-name">{name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="decklist-main">
            <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {deckData.note}
            </div>

            {/* Card count summary */}
            <div style={{ background: 'var(--bg-primary)', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px', fontSize: '.78rem' }}>
              {isCmdr ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Commander</span><span>1</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span>Deck</span><span>{mainCount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px solid var(--border)', paddingTop: '6px', fontWeight: 700, color: total === 100 ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                    <span>Total</span><span>{total} / 100</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Main Deck</span><span style={{ color: mainCount === 60 ? 'var(--accent-gold)' : 'inherit' }}>{mainCount} / 60</span>
                  </div>
                  {sideCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span>Sideboard</span><span style={{ color: sideCount === 15 ? 'var(--accent-gold)' : 'inherit' }}>{sideCount} / 15</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a href={deckData.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                MTGGoldfish ↗
              </a>
            </div>
          </div>
        </div>

        <div className="decklist-footer">
          <span className="dl-card-count">{total} cards</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
