import { useState, useEffect } from 'react'
import { addCard } from '../lib/db'
import { searchScryfall, getCardDetails, delay } from '../lib/utils'

export default function AddCardModal({ onClose, prefill, user, collection, setCollection, showToast }) {
  const [cardName, setCardName] = useState(prefill?.name || '')
  const [qty, setQty] = useState(1)
  const [condition, setCondition] = useState('NM')
  const [suggestions, setSuggestions] = useState([])
  const [cardData, setCardData] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (cardName.length < 2) { setSuggestions([]); return }
    const timer = setTimeout(async () => {
      const results = await searchScryfall(cardName)
      setSuggestions(results.slice(0, 8))
      setShowDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [cardName])

  const selectCard = async (name) => {
    setCardName(name)
    setSuggestions([])
    setShowDropdown(false)
    const data = await getCardDetails(name)
    setCardData(data)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!cardName) return
    const card = {
      name: cardName,
      qty: parseInt(qty),
      condition,
      setName:      cardData?.set_name || cardData?.set?.name || 'Unknown',
      img:          cardData?.image_uris?.small || cardData?.card_faces?.[0]?.image_uris?.small || null,
      colors:       cardData?.color_identity || [],
      price:        cardData?.prices?.usd ? parseFloat(cardData.prices.usd) : null,
      tcgplayerUrl: cardData?.purchase_uris?.tcgplayer || null,
      scryfallId:   cardData?.id || null,
    }
    try {
      await addCard(card, user?.id)
      setCollection(prev => {
        const i = prev.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
        if (i >= 0) {
          const next = [...prev]; next[i] = { ...next[i], qty: next[i].qty + card.qty }; return next
        }
        return [...prev, card]
      })
      showToast('Card added!')
      onClose()
    } catch (err) {
      showToast(`Save failed: ${err.message}`)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="modal-box">
        <h3>+ Add Card to Collection</h3>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Card Name</label>
            <input
              type="text"
              className="form-input"
              value={cardName}
              onChange={e => setCardName(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="Search Scryfall..."
              autoComplete="off"
            />
            {showDropdown && suggestions.length > 0 && (
              <div className="ac-dropdown">
                {suggestions.map(card => (
                  <div
                    key={card}
                    className="ac-item"
                    onClick={() => selectCard(card)}
                  >
                    {card}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid-2 gap-12">
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input type="number" className="form-input" value={qty} onChange={e => setQty(e.target.value)} min="1" />
            </div>
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select className="form-select" value={condition} onChange={e => setCondition(e.target.value)}>
                <option>NM</option>
                <option>LP</option>
                <option>MP</option>
                <option>HP</option>
              </select>
            </div>
          </div>

          {cardData && (
            <div style={{ padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px', marginBottom: '16px', fontSize: '.8rem' }}>
              Found: {cardData.name} ({cardData.set?.name})
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Card</button>
          </div>
        </form>
      </div>
    </div>
  )
}
