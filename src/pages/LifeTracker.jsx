import { useState } from 'react'

const FORMATS = ['Commander', 'Standard', 'Pioneer', 'Modern', 'Legacy', 'Premodern', 'Brawl', 'Historic', 'Draft', 'Sealed']
const LIFE_OPTIONS = [20, 25, 30, 40, 50, 60]
const PLAYER_COUNTS = [1, 2, 3, 4, 5, 6]

const PLAYER_COLORS = [
  ['#1ec4a6', '#0d9488'],
  ['#3b82f6', '#1e40af'],
  ['#f97316', '#c2410c'],
  ['#a855f7', '#6d28d9'],
  ['#ec4899', '#9d174d'],
  ['#eab308', '#a16207'],
]

const ORIENTATIONS = {
  1: [{ id: 'single', label: 'Single', rows: [[0]] }],
  2: [
    { id: 'facing', label: 'Face to Face',   rows: [[180], [0]] },
    { id: 'side',   label: 'Side by Side',   rows: [[0, 0]] },
  ],
  3: [
    { id: 'facing', label: 'Face to Face',     rows: [[180], [0, 0]] },
    { id: 'same',   label: 'Same Direction',   rows: [[0], [0, 0]] },
  ],
  4: [
    { id: 'facing', label: 'Face to Face',   rows: [[180, 180], [0, 0]] },
    { id: 'same',   label: 'Same Direction', rows: [[0, 0], [0, 0]] },
  ],
  5: [
    { id: 'facing', label: 'Face to Face',     rows: [[180, 180], [0, 0, 0]] },
    { id: 'same',   label: 'Same Direction',   rows: [[0, 0], [0, 0, 0]] },
  ],
  6: [
    { id: 'facing', label: 'Face to Face',     rows: [[180, 180, 180], [0, 0, 0]] },
    { id: 'same',   label: 'Same Direction',   rows: [[0, 0, 0], [0, 0, 0]] },
  ],
}

function defaultLifeForFormat(format) {
  return (format === 'Commander' || format === 'Brawl') ? 40 : 20
}

function OrientationPreview({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: 48, width: '100%' }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 4, flex: 1 }}>
          {row.map((rot, ci) => (
            <div key={ci} style={{
              flex: 1, borderRadius: 4,
              background: 'var(--accent-gold-glow)',
              border: '1px solid var(--accent-gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: '.65rem', color: 'var(--accent-gold)', display: 'inline-block', transform: `rotate(${rot}deg)` }}>▲</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function LifeTracker({ setPage, openLogMatch }) {
  const [view, setView] = useState('setup')
  const [format, setFormat] = useState('Commander')
  const [lifeTotal, setLifeTotal] = useState(40)
  const [playerCount, setPlayerCount] = useState(4)
  const [orientationId, setOrientationId] = useState('facing')
  const [players, setPlayers] = useState(null)
  const [showMenu, setShowMenu] = useState(false)

  const handleFormatChange = (f) => {
    setFormat(f)
    setLifeTotal(defaultLifeForFormat(f))
  }

  const handlePlayerCountChange = (n) => {
    setPlayerCount(n)
    setOrientationId(ORIENTATIONS[n][0].id)
  }

  const startMatch = () => {
    setPlayers(Array.from({ length: playerCount }, (_, i) => ({
      id: i, name: `Player ${i + 1}`, life: lifeTotal,
    })))
    setView('game')
    setShowMenu(false)
  }

  const adjustLife = (id, delta) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, life: p.life + delta } : p))
  }

  const renamePlayer = (id, name) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }

  const resetLife = () => {
    setPlayers(prev => prev.map(p => ({ ...p, life: lifeTotal })))
    setShowMenu(false)
  }

  const setupAgain = () => {
    setShowMenu(false)
    setView('setup')
  }

  const goHome = () => {
    setShowMenu(false)
    setPage?.('dashboard')
  }

  const logMatch = () => {
    setShowMenu(false)
    openLogMatch?.()
  }

  if (view === 'game' && players) {
    const orientations = ORIENTATIONS[players.length]
    const orientation = orientations.find(o => o.id === orientationId) || orientations[0]
    let idx = 0
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 8, fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
          {format} · Starting Life {lifeTotal}
        </div>
        <div className="lt-game-container">
          {orientation.rows.map((row, ri) => (
            <div key={ri} className="lt-game-row">
              {row.map((rot) => {
                const player = players[idx]
                idx += 1
                const [from, to] = PLAYER_COLORS[player.id % PLAYER_COLORS.length]
                return (
                  <div
                    key={player.id}
                    className="lt-player-card"
                    style={{
                      background: `linear-gradient(135deg, ${from}, ${to})`,
                      transform: `rotate(${rot}deg)`,
                    }}
                  >
                    <input
                      className="lt-player-name"
                      value={player.name}
                      onChange={e => renamePlayer(player.id, e.target.value)}
                      maxLength={16}
                    />
                    <div className="lt-life-row">
                      <button className="lt-life-btn" onClick={() => adjustLife(player.id, -1)} aria-label="Decrease life">−</button>
                      <div className={`lt-life-total ${player.life <= 0 ? 'zero' : ''}`}>{player.life}</div>
                      <button className="lt-life-btn" onClick={() => adjustLife(player.id, 1)} aria-label="Increase life">+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <button className="lt-fab" onClick={() => setShowMenu(true)} aria-label="Game menu">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="11" cy="4" r="1.8" fill="currentColor" />
            <circle cx="11" cy="11" r="1.8" fill="currentColor" />
            <circle cx="11" cy="18" r="1.8" fill="currentColor" />
          </svg>
        </button>

        {showMenu && (
          <div className="auth-modal open" onClick={() => setShowMenu(false)}>
            <div className="modal-box" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ textAlign: 'center' }}>Game Menu</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={resetLife}>
                  🔄 Reset Life Totals
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={setupAgain}>
                  ⚙️ Set Up Again
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={logMatch}>
                  📝 Log Match
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={goHome}>
                  🏠 Home
                </button>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => setShowMenu(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: '2rem', marginBottom: 4 }}>❤️</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 4 }}>Life Tracker</h2>
        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>Set up your game and start tracking life totals.</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label className="form-label">Format</label>
          <select className="form-select" value={format} onChange={e => handleFormatChange(e.target.value)}>
            {FORMATS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Starting Life Total</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {LIFE_OPTIONS.map(n => (
              <button
                key={n}
                type="button"
                className={`lt-pill ${lifeTotal === n ? 'active' : ''}`}
                onClick={() => setLifeTotal(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Player Count</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {PLAYER_COUNTS.map(n => (
              <button
                key={n}
                type="button"
                className={`lt-pill ${playerCount === n ? 'active' : ''}`}
                onClick={() => handlePlayerCountChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {ORIENTATIONS[playerCount].length > 1 && (
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="form-label">Orientation</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {ORIENTATIONS[playerCount].map(o => (
                <button
                  key={o.id}
                  type="button"
                  className={`lt-orientation-btn ${orientationId === o.id ? 'active' : ''}`}
                  onClick={() => setOrientationId(o.id)}
                >
                  <OrientationPreview rows={o.rows} />
                  <div style={{ fontSize: '.75rem', fontWeight: 600, marginTop: 8 }}>{o.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: '1rem' }}
          onClick={startMatch}
        >
          Start Match
        </button>
      </div>
    </div>
  )
}
