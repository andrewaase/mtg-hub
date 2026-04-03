import { useState, useEffect } from 'react'
import { searchScryfall, getCardDetails, getAllPrintings } from '../lib/utils'

export default function CardLookup({ showToast, openAddCard }) {
  const [search, setSearch] = useState('')
  const [cardData, setCardData] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [printings, setPrintings] = useState([])
  const [loading, setLoading] = useState(false)

  // Pick up a random card passed from the Dashboard
  useEffect(() => {
    if (window.__randomCard) {
      const card = window.__randomCard
      window.__randomCard = null
      setCardData(card)
      setSearch(card.name)
      getAllPrintings(card.name).then(setPrintings).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (search.length < 2) { setSuggestions([]); return }
    const timer = setTimeout(async () => {
      const results = await searchScryfall(search)
      setSuggestions(results.slice(0, 8))
      setShowDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const searchCard = async (name) => {
    setLoading(true)
    const card = await getCardDetails(name)
    if (card) {
      setCardData(card)
      const prints = await getAllPrintings(name)
      setPrintings(prints)
      setShowDropdown(false)
    } else {
      showToast('Card not found')
    }
    setLoading(false)
  }

  const handleCardSelect = (name) => {
    setSearch(name)
    setSuggestions([])
    searchCard(name)
  }

  return (
    <div>
      <div className="search-bar">
        <div className="search-wrapper" style={{ position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search for any Magic card..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onKeyDown={e => e.key === 'Enter' && searchCard(search)}
          />
          {showDropdown && suggestions.length > 0 && (
            <div className="ac-dropdown">
              {suggestions.map(card => (
                <div key={card} className="ac-item" onClick={() => handleCardSelect(card)}>
                  {card}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => search && searchCard(search)}>🔍 Search</button>
        <button className="btn btn-ghost" onClick={async () => {
          setLoading(true)
          try {
            const res = await fetch('https://api.scryfall.com/cards/random')
            if (res.ok) {
              const card = await res.json()
              setCardData(card)
              setSearch(card.name)
              getAllPrintings(card.name).then(setPrintings).catch(() => {})
            }
          } catch { /* ignore */ }
          setLoading(false)
        }}>🎲 Random</button>
      </div>

      {loading && (
        <div className="news-loading">
          <div className="spinner"></div>
        </div>
      )}

      {cardData && (
        <div className="card-result">
          <div className="card-image-wrap">
            {cardData.image_uris?.normal && <img src={cardData.image_uris.normal} alt={cardData.name} />}
          </div>
          <div className="card-details">
            <h2>{cardData.name}</h2>
            <div className="card-type-line">{cardData.type_line}</div>
            {cardData.oracle_text && <div className="card-oracle">{cardData.oracle_text}</div>}
            <div className="price-grid">
              <div className="price-item">
                <div className="price-label">USD</div>
                <div className="price-value">${cardData.prices?.usd || 'N/A'}</div>
              </div>
              <div className="price-item">
                <div className="price-label">EUR</div>
                <div className="price-value">€{cardData.prices?.eur || 'N/A'}</div>
              </div>
              <div className="price-item">
                <div className="price-label">Set</div>
                <div className="price-value">{cardData.set?.toUpperCase()}</div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => openAddCard(cardData)}>+ Add to Collection</button>
          </div>
        </div>
      )}

      {printings.length > 0 && (
        <div>
          <div className="section-title" style={{ marginTop: '28px' }}>🖼️ All Printings</div>
          <div className="prints-grid">
            {printings.slice(0, 20).map((card, i) => (
              <div key={i} className="print-card">
                {card.image_uris?.small && <img src={card.image_uris.small} alt="" />}
                <div className="print-card-label">{card.set?.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
