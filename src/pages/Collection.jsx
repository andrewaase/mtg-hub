import { useState, useMemo, useEffect, useRef } from 'react'
import { removeCard, exportData, bulkAddCards, updateCollectionCard } from '../lib/db'
import { getTCGPlayerLink } from '../lib/tcgplayer'
import { bulkRefreshPrices, suggestPrice } from '../lib/pricing'
import { getCKPriceMap, getCKBuyPrice, getSellSignal } from '../lib/cardkingdom'
import { getABUPriceMap, getABUBuyPrice, getABUBuylistLink } from '../lib/abugames'
import { getSCGPriceMap, getSCGBuyPrice, isSCGHotlist, getSCGBuylistLink } from '../lib/starcitygames'

const COLOR_OPTIONS = [
  { id: 'W', label: '☀️ White' },
  { id: 'U', label: '💧 Blue' },
  { id: 'B', label: '💀 Black' },
  { id: 'R', label: '🔥 Red' },
  { id: 'G', label: '🌿 Green' },
  { id: 'C', label: '⬡ Colorless' },
]
const RARITY_OPTIONS    = ['common', 'uncommon', 'rare', 'mythic']
const CONDITION_OPTIONS = ['NM', 'LP', 'MP', 'HP']

function ChipRow({ options, value, onChange, multi = false, labelFn }) {
  function toggle(id) {
    if (multi) {
      const next = value.includes(id) ? value.filter(v => v !== id) : [...value, id]
      onChange(next)
    } else {
      onChange(value === id ? null : id)
    }
  }
  const isActive = (id) => multi ? value.includes(id) : value === id
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {options.map(opt => {
        const id = typeof opt === 'string' ? opt : opt.id
        const label = labelFn ? labelFn(opt) : (typeof opt === 'string' ? opt : opt.label)
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            style={{
              padding: '5px 12px',
              borderRadius: '99px',
              border: `1.5px solid ${isActive(id) ? 'var(--accent-teal)' : 'var(--border)'}`,
              background: isActive(id) ? 'rgba(245,158,11,.15)' : 'var(--bg-secondary)',
              color: isActive(id) ? 'var(--accent-teal)' : 'var(--text-secondary)',
              fontSize: '.72rem', fontWeight: isActive(id) ? 700 : 400,
              cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

const CONDITION_LABELS = { NM: 'Near Mint', LP: 'Light Play', MP: 'Moderate Play', HP: 'Heavy Play', DMG: 'Damaged' }
const CONDITION_LIST   = ['NM', 'LP', 'MP', 'HP', 'DMG']

// ── Bulk Import ───────────────────────────────────────────────────────────────

function parseBulkText(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//') && !l.startsWith('#'))
  if (lines.length === 0) return { rows: [], format: 'empty' }

  // ── CSV detection: first line contains a comma and a word like "name" ──
  const firstLower = lines[0].toLowerCase()
  if (firstLower.includes(',') && (firstLower.includes('name') || firstLower.includes('card'))) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'card name' || h === 'card')
    const qtyIdx  = headers.findIndex(h => h === 'qty' || h === 'quantity' || h === 'count' || h === 'amount')
    const condIdx = headers.findIndex(h => h === 'condition' || h === 'cond')
    const setIdx  = headers.findIndex(h => h === 'set' || h === 'set name' || h === 'edition')
    if (nameIdx === -1) return { rows: [], format: 'csv-bad-headers' }
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const name = cols[nameIdx]
      if (!name) continue
      rows.push({
        name,
        qty:       parseInt(cols[qtyIdx]) || 1,
        condition: (condIdx >= 0 && cols[condIdx] ? cols[condIdx].toUpperCase() : 'NM'),
        setName:   setIdx >= 0 ? (cols[setIdx] || null) : null,
      })
    }
    return { rows, format: 'csv' }
  }

  // ── Line-by-line formats ──
  const rows = []
  let format = 'plain'

  for (const line of lines) {
    let name, qty, condition, setName

    // "4 Lightning Bolt (M19) 100" — Arena with collector number
    let m = line.match(/^(\d+)[x\s]+(.+?)\s+\(([A-Z0-9]+)\)\s*\d+\s*(?:(NM|LP|MP|HP|DMG))?$/i)
    if (m) {
      ;[, qty, name, , condition] = m
      qty = parseInt(qty); format = 'arena'
      rows.push({ name: name.trim(), qty, condition: (condition || 'NM').toUpperCase(), setName: null })
      continue
    }

    // "4 Lightning Bolt (M19)" — set code only
    m = line.match(/^(\d+)[x\s]+(.+?)\s+\(([A-Z0-9]+)\)\s*(?:(NM|LP|MP|HP|DMG))?$/i)
    if (m) {
      ;[, qty, name, setName, condition] = m
      qty = parseInt(qty); format = 'arena'
      rows.push({ name: name.trim(), qty, condition: (condition || 'NM').toUpperCase(), setName: setName || null })
      continue
    }

    // "4x Lightning Bolt" or "4 Lightning Bolt" (with optional condition)
    m = line.match(/^(\d+)x?\s+(.+?)(?:\s+(NM|LP|MP|HP|DMG))?$/i)
    if (m) {
      ;[, qty, name, condition] = m
      qty = parseInt(qty); if (format === 'plain') format = 'mtgo'
      rows.push({ name: name.trim(), qty, condition: (condition || 'NM').toUpperCase(), setName: null })
      continue
    }

    // "Lightning Bolt x4" (with optional condition)
    m = line.match(/^(.+?)\s+x(\d+)(?:\s+(NM|LP|MP|HP|DMG))?$/i)
    if (m) {
      ;[, name, qty, condition] = m
      qty = parseInt(qty); if (format === 'plain') format = 'reverse'
      rows.push({ name: name.trim(), qty, condition: (condition || 'NM').toUpperCase(), setName: null })
      continue
    }

    // "Lightning Bolt NM" — plain with condition
    m = line.match(/^(.+?)\s+(NM|LP|MP|HP|DMG)$/i)
    if (m) {
      ;[, name, condition] = m
      rows.push({ name: name.trim(), qty: 1, condition: condition.toUpperCase(), setName: null })
      continue
    }

    // Bare card name — qty 1
    if (/^[A-Za-z'',\-’ ]+$/.test(line)) {
      rows.push({ name: line, qty: 1, condition: 'NM', setName: null })
    }
    // else: skip unparseable lines silently
  }

  return { rows, format }
}

const FORMAT_LABELS = {
  plain:          'Card names (1 each)',
  mtgo:           'MTGO / clipboard format',
  arena:          'MTG Arena format',
  reverse:        'Name x# format',
  csv:            'CSV with headers',
  'csv-bad-headers': 'CSV (no "name" column found)',
  empty:          'No cards found',
}

function BulkImportModal({ onClose, collection, setCollection, user, showToast }) {
  const [step,      setStep]      = useState('input')   // input | preview | importing | done
  const [rawText,   setRawText]   = useState('')
  const [parsed,    setParsed]    = useState([])         // [{name,qty,condition,setName,_id}]
  const [parseInfo, setParseInfo] = useState(null)       // {format, count}
  const [parseErr,  setParseErr]  = useState('')
  const [progress,  setProgress]  = useState({ done: 0, total: 0 })
  const [results,   setResults]   = useState(null)       // {added,updated,errors[]}
  const fileRef = useRef()

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => setRawText(evt.target.result || '')
    reader.readAsText(file)
  }

  function handleParse() {
    const { rows, format } = parseBulkText(rawText)
    if (rows.length === 0) {
      setParseErr(
        format === 'empty'            ? 'Nothing to import. Paste some cards first.' :
        format === 'csv-bad-headers'  ? 'CSV detected but no "name" column found. Add a header row.' :
        'No cards could be parsed from this text.'
      )
      return
    }
    setParseErr('')
    setParseInfo({ format, count: rows.length })
    setParsed(rows.map((r, i) => ({ ...r, _id: i })))
    setStep('preview')
  }

  function updateRow(id, patch) {
    setParsed(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r))
  }

  function removeRow(id) {
    setParsed(prev => prev.filter(r => r._id !== id))
  }

  async function handleImport() {
    if (parsed.length === 0) return
    setStep('importing')
    setProgress({ done: 0, total: parsed.length })

    // ── Batch-fetch Scryfall data (up to 75 per request) ──
    const uniqueNames = [...new Set(parsed.map(r => r.name))]
    const sfMap = {} // lowercase name → scryfall card object

    for (let i = 0; i < uniqueNames.length; i += 75) {
      const batch = uniqueNames.slice(i, i + 75)
      try {
        const res  = await fetch('https://api.scryfall.com/cards/collection', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ identifiers: batch.map(name => ({ name })) }),
        })
        const json = await res.json()
        ;(json.data || []).forEach(card => {
          sfMap[card.name.toLowerCase()] = card
        })
      } catch {
        // Continue without enrichment for this batch
      }
      if (i + 75 < uniqueNames.length) await new Promise(r => setTimeout(r, 120))
    }

    // ── Enrich parsed rows with Scryfall data ──
    const enriched = parsed.map(row => {
      const sf     = sfMap[row.name.toLowerCase()]
      const img    = sf?.image_uris?.small || sf?.card_faces?.[0]?.image_uris?.small || null
      const colors = sf?.colors            || sf?.card_faces?.[0]?.colors            || []
      const price  = sf ? (parseFloat(sf.prices?.usd) || null) : null
      const setName = sf?.set_name || row.setName || null
      return { name: row.name, qty: row.qty, condition: row.condition, setName, img, colors, price, scryfallId: sf?.id ?? null }
    })

    // ── Bulk insert / update ──
    let added = 0, updated = 0
    const errors = []
    try {
      const prevSize  = collection.length
      const newColl   = await bulkAddCards(enriched, user?.id, {
        onProgress: (done, total) => setProgress({ done, total }),
      })
      added   = newColl.length - prevSize
      updated = enriched.length - Math.max(0, added)
      setCollection(newColl)
    } catch (e) {
      errors.push(e.message)
    }

    setResults({ added: Math.max(0, added), updated: Math.max(0, updated), errors })
    setStep('done')
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 500, backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(680px, 97vw)', maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 501, padding: '24px 24px 20px',
        boxShadow: '0 24px 60px rgba(0,0,0,.7)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: '1.5rem' }}>📥</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Bulk Import Collection</div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
              Paste a card list or upload a .txt / .csv file
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: '.9rem' }}>✕</button>
        </div>

        {/* Step: input */}
        {step === 'input' && (
          <>
            {/* Format examples */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Supported formats:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 20px' }}>
                <span><code style={{ color: 'var(--accent-teal)' }}>4 Lightning Bolt</code> MTGO/clipboard</span>
                <span><code style={{ color: 'var(--accent-teal)' }}>4x Lightning Bolt</code> x prefix</span>
                <span><code style={{ color: 'var(--accent-teal)' }}>Lightning Bolt x4</code> x suffix</span>
                <span><code style={{ color: 'var(--accent-teal)' }}>4 Lightning Bolt (M19)</code> Arena</span>
                <span><code style={{ color: 'var(--accent-teal)' }}>Lightning Bolt</code> plain (qty 1)</span>
                <span><code style={{ color: 'var(--accent-teal)' }}>name,qty,condition</code> CSV</span>
              </div>
              <div style={{ marginTop: 6, fontSize: '.68rem' }}>Add <code style={{ color: 'var(--accent-teal)' }}>NM</code>, <code>LP</code>, <code>MP</code>, or <code>HP</code> after the name to set condition.</div>
            </div>

            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={'4 Lightning Bolt\n2 Counterspell LP\n1 Black Lotus NM\n\nOr paste a full Arena / MTGO deck export…'}
              style={{
                width: '100%', minHeight: 220, resize: 'vertical',
                background: 'var(--bg-card)', border: `1.5px solid ${parseErr ? '#f87171' : 'var(--border)'}`,
                borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)',
                fontFamily: 'monospace', fontSize: '.82rem', lineHeight: 1.6,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {parseErr && <div style={{ color: '#f87171', fontSize: '.75rem', marginTop: 6 }}>{parseErr}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={handleParse}
                disabled={!rawText.trim()}
              >
                Preview Import →
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => fileRef.current?.click()}
              >
                📁 Upload File
              </button>
              <input ref={fileRef} type="file" accept=".txt,.csv,.dec,.mwdeck" style={{ display: 'none' }} onChange={handleFile} />
              {rawText.trim() && (
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {rawText.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#')).length} lines
                </span>
              )}
            </div>
          </>
        )}

        {/* Step: preview */}
        {step === 'preview' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                Detected: <strong style={{ color: 'var(--accent-teal)' }}>{FORMAT_LABELS[parseInfo?.format] || parseInfo?.format}</strong>
              </div>
              <div style={{ background: 'rgba(99,102,241,.15)', color: '#a5b4fc', borderRadius: 99, padding: '2px 10px', fontSize: '.72rem', fontWeight: 700 }}>
                {parsed.length} card{parsed.length !== 1 ? 's' : ''}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setStep('input')} style={{ marginLeft: 'auto', fontSize: '.72rem' }}>
                ← Edit
              </button>
            </div>

            {/* Preview table */}
            <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Card Name</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 60 }}>Qty</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 80 }}>Condition</th>
                    <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map(row => (
                    <tr key={row._id} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                      <td style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>{row.name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <input
                          type="number" min="1" max="99"
                          value={row.qty}
                          onChange={e => updateRow(row._id, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                          style={{ width: 48, textAlign: 'center', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '3px 4px', fontSize: '.78rem' }}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <select
                          value={row.condition}
                          onChange={e => updateRow(row._id, { condition: e.target.value })}
                          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '3px 6px', fontSize: '.75rem', cursor: 'pointer' }}
                        >
                          {CONDITION_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button onClick={() => removeRow(row._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '.8rem', lineHeight: 1, padding: '2px 4px' }} title="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={parsed.length === 0}
              >
                Import {parsed.length} Card{parsed.length !== 1 ? 's' : ''} →
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('input')}>← Back</button>
              <span style={{ marginLeft: 'auto', fontSize: '.7rem', color: 'var(--text-muted)' }}>
                Existing cards will have their qty increased
              </span>
            </div>
          </>
        )}

        {/* Step: importing */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 6 }}>Importing your collection…</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Fetching card data from Scryfall, then saving to your collection.
            </div>
            <div style={{ height: 6, background: 'var(--bg-hover)', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', background: 'var(--accent-teal)', borderRadius: 99,
                width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                transition: 'width .4s',
              }} />
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
              {progress.done} / {progress.total}
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && results && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>
              {results.errors.length === 0 ? '🎉' : '⚠️'}
            </div>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 16 }}>Import Complete</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: '10px 20px', minWidth: 80 }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4ade80' }}>{results.added}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>New cards</div>
              </div>
              <div style={{ background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.3)', borderRadius: 10, padding: '10px 20px', minWidth: 80 }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a5b4fc' }}>{results.updated}</div>
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Qty updated</div>
              </div>
              {results.errors.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 20px', minWidth: 80 }}>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f87171' }}>{results.errors.length}</div>
                  <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Errors</div>
                </div>
              )}
            </div>
            {results.errors.length > 0 && (
              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, textAlign: 'left', fontSize: '.72rem', color: '#f87171', maxHeight: 100, overflowY: 'auto' }}>
                {results.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </>
  )
}

function CollectionCardModal({ card, onClose, onRemove, onUpdateCard }) {
  const [scryfallData,  setScryfallData]  = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [editQty,       setEditQty]       = useState(card.qty)
  const [localForSale,  setLocalForSale]  = useState(!!card.forSale)
  const [localForTrade, setLocalForTrade] = useState(!!card.forTrade)

  useEffect(() => {
    const url = card.scryfallId
      ? `https://api.scryfall.com/cards/${card.scryfallId}`
      : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setScryfallData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [card.name, card.scryfallId])

  function commitQty(val) {
    const n = Math.max(1, parseInt(val) || 1)
    setEditQty(n)
    if (n !== card.qty) onUpdateCard?.(card.id, { qty: n })
  }

  const face     = scryfallData?.card_faces?.[0] || scryfallData
  const oracle   = face?.oracle_text || ''
  const typeLine = face?.type_line || scryfallData?.type_line || ''
  const manaCost = face?.mana_cost || scryfallData?.mana_cost || ''
  const flavor   = face?.flavor_text || ''
  const power    = scryfallData?.power
  const tough    = scryfallData?.toughness
  const loyalty  = scryfallData?.loyalty
  const img = scryfallData
    ? (scryfallData.image_uris?.normal || scryfallData.card_faces?.[0]?.image_uris?.normal)
    : card.img

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 400, backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(560px,96vw)', maxHeight: '92vh', overflowY: 'auto',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 18, zIndex: 401, padding: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,.65)',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: '50%',
          width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: '.9rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {/* Card image */}
          <div style={{ flexShrink: 0 }}>
            {img
              ? <img src={img} alt={card.name} style={{ width: 'min(200px,40vw)', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,.6)', display: 'block' }} />
              : <div style={{ width: 'min(200px,40vw)', aspectRatio: '63/88', background: 'var(--bg-card)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem' }}>🃏</div>
            }
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.25, paddingRight: 32 }}>{card.name}</div>
              {!loading && typeLine && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>{typeLine}</div>}
              {!loading && manaCost && <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>{manaCost}</div>}
            </div>

            {loading && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading card text…</div>}

            {!loading && oracle && (
              <div style={{ fontSize: '.78rem', lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', padding: '9px 11px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                {oracle}
              </div>
            )}

            {!loading && (power != null || loyalty != null) && (
              <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                {power != null ? `${power}/${tough}` : `Loyalty: ${loyalty}`}
              </div>
            )}

            {!loading && flavor && (
              <div style={{ fontSize: '.68rem', fontStyle: 'italic', color: 'var(--text-muted)', borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>{flavor}</div>
            )}

            {/* Collection metadata */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
              {/* Editable qty */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>Copies</span>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-hover)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => commitQty(editQty - 1)}
                    disabled={editQty <= 1}
                    style={{ padding: '2px 8px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: editQty > 1 ? 'pointer' : 'default', fontSize: '1rem', lineHeight: 1 }}
                  >−</button>
                  <input
                    type="number" min="1" max="999"
                    value={editQty}
                    onChange={e => setEditQty(parseInt(e.target.value) || 1)}
                    onBlur={e => commitQty(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitQty(e.target.value)}
                    style={{ width: 36, textAlign: 'center', background: 'none', border: 'none', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.82rem', padding: '3px 0', outline: 'none' }}
                  />
                  <button
                    onClick={() => commitQty(editQty + 1)}
                    style={{ padding: '2px 8px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                  >+</button>
                </div>
              </div>
              {card.condition && (
                <span style={{ fontSize: '.65rem', fontWeight: 600, background: 'var(--bg-hover)', color: 'var(--text-secondary)', borderRadius: 4, padding: '2px 8px' }}>
                  {CONDITION_LABELS[card.condition] || card.condition}
                </span>
              )}
              {card.isFoil && (
                <span style={{ fontSize: '.62rem', fontWeight: 700, background: 'linear-gradient(135deg,#a78bfa,#c084fc)', color: '#fff', borderRadius: 4, padding: '2px 7px' }}>✦ FOIL</span>
              )}
              {card.setName && <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{card.setName}</span>}
            </div>

            {card.price != null && (
              <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--accent-gold)' }}>${parseFloat(card.price).toFixed(2)}</div>
            )}

            {/* ── Binder toggles ── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => {
                  const next = !localForTrade
                  setLocalForTrade(next)
                  onUpdateCard?.(card.id, { forTrade: next })
                }}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8,
                  border: `1.5px solid ${localForTrade ? 'var(--accent-teal)' : 'var(--border)'}`,
                  background: localForTrade ? 'rgba(20,184,166,.12)' : 'var(--bg-secondary)',
                  color: localForTrade ? 'var(--accent-teal)' : 'var(--text-secondary)',
                  fontWeight: localForTrade ? 700 : 400, fontSize: '.78rem',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {localForTrade ? '✓ Trade Binder' : '⇄ Trade Binder'}
              </button>
              <button
                onClick={() => {
                  const next = !localForSale
                  setLocalForSale(next)
                  onUpdateCard?.(card.id, { forSale: next })
                }}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 8,
                  border: `1.5px solid ${localForSale ? 'var(--accent-gold)' : 'var(--border)'}`,
                  background: localForSale ? 'rgba(202,138,4,.12)' : 'var(--bg-secondary)',
                  color: localForSale ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  fontWeight: localForSale ? 700 : 400, fontSize: '.78rem',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {localForSale ? '✓ Sell Binder' : '🏷️ Sell Binder'}
              </button>
            </div>

            <button
              onClick={() => { onRemove(card.id); onClose() }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: '#f87171', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', alignSelf: 'flex-start' }}
            >
              Remove from collection
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const CARD_TYPES = ['Creature', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Planeswalker', 'Land', 'Battle']

// ── Binder persistence ─────────────────────────────────────────────────────────
// forSale / forTrade don't live in Supabase, so we track them in a separate
// localStorage key that survives page refreshes and Supabase reloads.
const BINDER_LS_KEY = 'mtg-hub-binders'
function readBinders() {
  try { return JSON.parse(localStorage.getItem(BINDER_LS_KEY) || '{}') } catch { return {} }
}
function writeBinders(map) {
  try { localStorage.setItem(BINDER_LS_KEY, JSON.stringify(map)) } catch {}
}

export default function Collection({ collection, setCollection, user, openAddCard, openCamera, showToast }) {
  const [view,         setView]         = useState('all')
  const [search,       setSearch]       = useState('')
  const [showFilters,  setShowFilters]  = useState(false)
  const [showBulk,     setShowBulk]     = useState(false)

  // Card type filter with lazy Scryfall fetch
  const [filterType,   setFilterType]   = useState(null)
  const [typeCache,    setTypeCache]    = useState({}) // name.toLowerCase() -> typeLine
  const [typesLoading, setTypesLoading] = useState(false)
  const [refreshing,   setRefreshing]   = useState(false)
  const [refreshProg,  setRefreshProg]  = useState(null)
  // tradeSelect removed — trade binder now uses forTrade flag on each card
  const [ckMap,        setCkMap]        = useState({})
  const [abuMap,       setAbuMap]       = useState({})
  const [scgMap,       setScgMap]       = useState({})
  const [selectedCard, setSelectedCard] = useState(null)

  // ── Filter state ──
  const [filterColors,    setFilterColors]    = useState([])
  const [filterRarity,    setFilterRarity]    = useState(null)
  const [filterCondition, setFilterCondition] = useState(null)
  const [filterFoil,      setFilterFoil]      = useState(null)   // 'foil' | 'nonfoil' | null
  const [filterMinPrice,  setFilterMinPrice]  = useState('')
  const [filterMaxPrice,  setFilterMaxPrice]  = useState('')
  const [filterSignal,    setFilterSignal]    = useState(null)   // null | 'good' | 'strong'
  const [sortBy,          setSortBy]          = useState('name_asc')

  // Load buylist price maps in background on mount
  useEffect(() => {
    getCKPriceMap().then(setCkMap).catch(() => {})
    getABUPriceMap().then(setAbuMap).catch(() => {})
    getSCGPriceMap().then(setScgMap).catch(() => {})
  }, [])

  // Safety-net: re-apply binder flags if a card was added mid-session (length increases)
  // and didn't arrive with forSale/forTrade already set.
  // The primary restore happens in App.jsx → withBinders() on every load.
  useEffect(() => {
    if (collection.length === 0) return
    const binders = readBinders()
    if (Object.keys(binders).length === 0) return
    // Only patch cards that are missing their flags (avoids no-op re-renders)
    const needsPatch = collection.some(c => {
      const b = binders[String(c.id)]
      return b && ((!c.forSale && b.forSale) || (!c.forTrade && b.forTrade))
    })
    if (!needsPatch) return
    setCollection(prev => prev.map(c => {
      const b = binders[String(c.id)]
      if (!b) return c
      return { ...c, forSale: b.forSale ?? !!c.forSale, forTrade: b.forTrade ?? !!c.forTrade }
    }))
  }, [collection.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── One-time migration: backfill scryfallId for existing collection cards ──
  // Runs in the background after collection loads. Uses the Scryfall /cards/collection
  // batch endpoint (75 per request) to look up Scryfall IDs by card name.
  // A localStorage flag prevents it from running more than once per browser.
  const migrationRunRef = useRef(false)
  useEffect(() => {
    if (collection.length === 0) return
    if (migrationRunRef.current) return
    if (localStorage.getItem('vs-scryfall-id-migration-v1')) return

    const missing = collection.filter(c => !c.scryfallId)
    if (missing.length === 0) {
      localStorage.setItem('vs-scryfall-id-migration-v1', '1')
      return
    }

    migrationRunRef.current = true
    let cancelled = false

    ;(async () => {
      const updates = {} // collectionCardId → scryfallId string

      for (let i = 0; i < missing.length; i += 75) {
        if (cancelled) return
        const batch = missing.slice(i, i + 75)
        try {
          const res = await fetch('https://api.scryfall.com/cards/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifiers: batch.map(c => ({ name: c.name })) }),
          })
          if (res.ok) {
            const { data = [] } = await res.json()
            for (const sfCard of data) {
              // Match by name (one Scryfall card can correspond to multiple
              // collection rows with the same name)
              batch
                .filter(c => c.name.toLowerCase() === sfCard.name.toLowerCase())
                .forEach(c => { updates[String(c.id)] = sfCard.id })
            }
          }
        } catch { /* skip batch on network error */ }
        if (i + 75 < missing.length) await new Promise(r => setTimeout(r, 120))
      }

      if (cancelled) return

      if (Object.keys(updates).length > 0) {
        // Update React state
        setCollection(prev => prev.map(c => {
          const sfId = updates[String(c.id)]
          return sfId ? { ...c, scryfallId: sfId } : c
        }))

        // Persist to Supabase (signed-in users)
        if (user?.id) {
          for (const [id, scryfallId] of Object.entries(updates)) {
            updateCollectionCard(id, { scryfallId }, user.id).catch(() => {})
          }
        }

        // Persist to localStorage (signed-out users)
        if (!user) {
          try {
            const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
            stored.collection = (stored.collection || []).map(c => {
              const sfId = updates[String(c.id)]
              return sfId ? { ...c, scryfallId: sfId } : c
            })
            localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
          } catch { /* storage full */ }
        }
      }

      localStorage.setItem('vs-scryfall-id-migration-v1', '1')
    })()

    return () => { cancelled = true }
  }, [collection.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeFilterCount = [
    filterColors.length > 0,
    filterRarity != null,
    filterCondition != null,
    filterFoil != null,
    filterType != null,
    filterMinPrice !== '',
    filterMaxPrice !== '',
    filterSignal != null,
  ].filter(Boolean).length

  function clearFilters() {
    setFilterColors([])
    setFilterRarity(null)
    setFilterCondition(null)
    setFilterFoil(null)
    setFilterType(null)
    setFilterMinPrice('')
    setFilterMaxPrice('')
    setFilterSignal(null)
  }

  // Lazy-fetch card types from Scryfall when type filter is activated
  useEffect(() => {
    if (!filterType) return
    const uncached = collection.filter(c => !(c.name.toLowerCase() in typeCache))
    if (uncached.length === 0) return

    setTypesLoading(true)
    const names = uncached.map(c => c.name)
    const batches = []
    for (let i = 0; i < names.length; i += 75) batches.push(names.slice(i, i + 75))

    Promise.all(batches.map(batch =>
      fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(name => ({ name })) }),
      }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    )).then(results => {
      const newEntries = {}
      results.forEach(r => {
        ;(r.data || []).forEach(card => {
          newEntries[card.name.toLowerCase()] = card.type_line || ''
        })
      })
      setTypeCache(prev => ({ ...prev, ...newEntries }))
      setTypesLoading(false)
    })
  }, [filterType, collection.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── helpers ──────────────────────────────────────────────────────────────

  function updateCard(id, patch) {
    const next = collection.map(c => c.id === id ? { ...c, ...patch } : c)
    setCollection(next)
    const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
    stored.collection = next
    localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
    // Persist forSale / forTrade to dedicated binder store (survives Supabase reloads)
    if (patch.forSale !== undefined || patch.forTrade !== undefined) {
      const binders = readBinders()
      const key = String(id)
      const prev = binders[key] || {}
      binders[key] = { ...prev }
      if (patch.forSale  !== undefined) binders[key].forSale  = patch.forSale
      if (patch.forTrade !== undefined) binders[key].forTrade = patch.forTrade
      writeBinders(binders)
    }
    // Persist qty / condition to Supabase
    if (patch.qty !== undefined || patch.condition !== undefined) {
      updateCollectionCard(id, patch, user?.id).catch(e => console.warn('[updateCard]', e))
    }
  }

  async function handleRemove(id) {
    await removeCard(id, user?.id)
    setCollection(collection.filter(c => c.id !== id))
    showToast('Card removed')
  }

  function handleExport() {
    const csv = 'Name,Quantity,Condition,Set,Foil,For Sale,Sale Price\n' +
      collection.map(c =>
        `"${c.name}",${c.qty},${c.condition || ''},"${c.setName || ''}",${c.isFoil ? 'Yes' : 'No'},${c.forSale ? 'Yes' : 'No'},${c.salePrice || ''}`
      ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'collection.csv'
    a.click()
    showToast('Exported to CSV')
  }

  function handleBackup() {
    exportData([], collection)
    showToast('Backup created')
  }

  async function handleBulkRefresh() {
    if (refreshing || collection.length === 0) return
    setRefreshing(true)
    setRefreshProg({ done: 0, total: collection.length })
    const updates = await bulkRefreshPrices(collection, {
      onProgress: (done, total) => setRefreshProg({ done, total }),
    })
    if (updates.length > 0) {
      const next = collection.map(c => {
        const u = updates.find(x => x.id === c.id)
        return u ? { ...c, price: u.price } : c
      })
      setCollection(next)
      const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
      stored.collection = next
      localStorage.setItem('mtg-hub-v1', JSON.stringify(stored))
      showToast(`Updated prices for ${updates.length} card${updates.length !== 1 ? 's' : ''} ✓`)
    } else {
      showToast('No price updates found')
    }
    setRefreshing(false)
    setRefreshProg(null)
  }

  // ── Trade binder ──────────────────────────────────────────────────────────
  const tradeCards  = collection.filter(c => c.forTrade)
  const tradeValue  = tradeCards.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)

  function copyTradeList() {
    const text = tradeCards.map(c =>
      `${c.qty}x ${c.name} (${c.setName || '?'}) $${(parseFloat(c.price) || 0).toFixed(2)}`
    ).join('\n') + `\n\nTotal: $${tradeValue.toFixed(2)}`
    navigator.clipboard.writeText(text).then(
      () => showToast('Trade list copied ✓'),
      () => showToast('Copy failed')
    )
  }

  // ── Filtering (memoized) ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let base = view === 'sell' ? collection.filter(c => c.forSale) : collection
    if (search)
      base = base.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    if (filterColors.length > 0)
      base = base.filter(c => filterColors.some(col => (c.colors || []).includes(col)))
    if (filterRarity)
      base = base.filter(c => (c.rarity || '').toLowerCase() === filterRarity)
    if (filterCondition)
      base = base.filter(c => (c.condition || 'NM') === filterCondition)
    if (filterFoil === 'foil')
      base = base.filter(c => c.isFoil)
    if (filterFoil === 'nonfoil')
      base = base.filter(c => !c.isFoil)
    if (filterMinPrice !== '')
      base = base.filter(c => (parseFloat(c.price) || 0) >= parseFloat(filterMinPrice))
    if (filterMaxPrice !== '')
      base = base.filter(c => (parseFloat(c.price) || 0) <= parseFloat(filterMaxPrice))
    if (filterType) {
      base = base.filter(c => {
        const tl = typeCache[c.name.toLowerCase()]
        if (tl === undefined) return true // not yet fetched, keep visible while loading
        return tl.includes(filterType)
      })
    }
    if (filterSignal && Object.keys(ckMap).length > 0) {
      base = base.filter(c => {
        const market = parseFloat(c.price) || 0
        if (market < 1) return false
        const ckBuy = getCKBuyPrice(ckMap, c.name, c.isFoil, c.scryfallId)
        return getSellSignal(ckBuy, market) === filterSignal
      })
    }
    // ── Sort ──
    const sorted = [...base]
    if (sortBy === 'name_asc')  sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sortBy === 'name_desc') sorted.sort((a, b) => b.name.localeCompare(a.name))
    if (sortBy === 'price_desc') sorted.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0))
    if (sortBy === 'price_asc')  sorted.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0))
    if (sortBy === 'qty_desc')   sorted.sort((a, b) => (b.qty || 1) - (a.qty || 1))
    return sorted
  }, [collection, view, search, filterColors, filterRarity, filterCondition, filterFoil, filterMinPrice, filterMaxPrice, filterType, typeCache, filterSignal, sortBy, ckMap])

  const total         = collection.reduce((s, c) => s + (c.qty || 1), 0)
  const totalValue    = collection.reduce((s, c) => s + (parseFloat(c.price) || 0) * (c.qty || 1), 0)
  const forSaleCount  = collection.filter(c => c.forSale).length
  const forTradeCount = tradeCards.length

  return (
    <div>
      {/* ── Top controls ── */}
      <div className="collection-controls">
        <input
          type="text"
          className="form-input"
          placeholder="Search cards…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 0, maxWidth: '220px' }}
        />
        <button className="btn btn-primary" onClick={() => openAddCard()}>+ Add</button>
        <button className="btn btn-ghost" onClick={() => openCamera()}>📷 Scan</button>
        <button className="btn btn-ghost" onClick={() => setShowBulk(true)} title="Bulk import from text or file" style={{ fontSize: '.78rem' }}>📥 Import</button>
        <button
          className="btn btn-ghost"
          onClick={handleBulkRefresh}
          disabled={refreshing}
          title="Re-fetch prices from Scryfall"
          style={{ fontSize: '.78rem' }}
        >
          {refreshing ? `${refreshProg?.done || 0}/${refreshProg?.total || '?'}` : '🔄'}
        </button>
        <button className="btn btn-ghost" onClick={handleExport} title="Export CSV">⬇️</button>
        <button className="btn btn-ghost" onClick={handleBackup} title="Backup JSON">💾</button>
        <span style={{ marginLeft: 'auto', fontSize: '.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {total} cards
          {totalValue > 0 && (
            <span style={{ color: 'var(--accent-gold)', marginLeft: '8px' }}>${totalValue.toFixed(2)}</span>
          )}
        </span>
      </div>

      {/* Refresh progress bar */}
      {refreshing && refreshProg && (
        <div style={{ height: '3px', background: 'var(--bg-hover)', borderRadius: '99px', marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--accent-teal)', borderRadius: '99px',
            width: `${(refreshProg.done / refreshProg.total) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>
      )}

      {/* ── View tabs ── */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '0', overflowX: 'auto' }}>
        {[
          ['all',   `All (${collection.length})`],
          ['sell',  `🏷️ Sell${forSaleCount > 0 ? ` (${forSaleCount})` : ''}`],
          ['trade', `⚖️ Trade${forTradeCount > 0 ? ` (${forTradeCount})` : ''}`],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            style={{
              padding: '10px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '.8rem', fontWeight: view === id ? 700 : 400,
              color: view === id ? 'var(--accent-teal)' : 'var(--text-muted)',
              borderBottom: view === id ? '2px solid var(--accent-teal)' : '2px solid transparent',
              marginBottom: '-1px', whiteSpace: 'nowrap', transition: 'color .15s',
            }}
          >
            {label}
          </button>
        ))}

      </div>

      {/* ── Filter row (All + Sell views) ── */}
      {(view === 'all' || view === 'sell') && (
        <div style={{ marginTop: '12px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: showFilters ? '12px' : '0', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowFilters(f => !f)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '99px',
                border: `1.5px solid ${activeFilterCount > 0 ? 'var(--accent-teal)' : 'var(--border)'}`,
                background: activeFilterCount > 0 ? 'rgba(245,158,11,.1)' : 'var(--bg-secondary)',
                color: activeFilterCount > 0 ? 'var(--accent-teal)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: '.75rem', fontWeight: 600,
              }}
            >
              ⚙️ Filter
              {activeFilterCount > 0 && (
                <span style={{
                  background: 'var(--accent-teal)', color: '#1a1000',
                  borderRadius: '99px', padding: '0 6px', fontSize: '.65rem', fontWeight: 800, minWidth: '18px', textAlign: 'center',
                }}>
                  {activeFilterCount}
                </span>
              )}
              <span style={{ opacity: 0.5, fontSize: '.65rem' }}>{showFilters ? '▲' : '▼'}</span>
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '.7rem', color: 'var(--text-muted)',
                }}
              >
                Clear all
              </button>
            )}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                background: 'var(--bg-secondary)', border: '1.5px solid var(--border)',
                borderRadius: '99px', color: 'var(--text-secondary)',
                padding: '5px 10px', fontSize: '.73rem', cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="name_asc">A → Z</option>
              <option value="name_desc">Z → A</option>
              <option value="price_desc">Price ↓</option>
              <option value="price_asc">Price ↑</option>
              <option value="qty_desc">Qty ↓</option>
            </select>
            <span style={{ marginLeft: 'auto', fontSize: '.72rem', color: 'var(--text-muted)' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {showFilters && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: '14px',
              marginBottom: '12px',
            }}>
              {/* Colors */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Color</div>
                <ChipRow options={COLOR_OPTIONS} value={filterColors} onChange={setFilterColors} multi />
              </div>

              {/* Rarity */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Rarity</div>
                <ChipRow
                  options={RARITY_OPTIONS}
                  value={filterRarity}
                  onChange={setFilterRarity}
                  labelFn={r => ({ common: '● Common', uncommon: '◈ Uncommon', rare: '◆ Rare', mythic: '✦ Mythic' }[r] || r)}
                />
              </div>

              {/* Condition */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Condition</div>
                <ChipRow options={CONDITION_OPTIONS} value={filterCondition} onChange={setFilterCondition} />
              </div>

              {/* Foil */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Finish</div>
                <ChipRow
                  options={['foil', 'nonfoil']}
                  value={filterFoil}
                  onChange={setFilterFoil}
                  labelFn={v => v === 'foil' ? '✦ Foil' : 'Non-Foil'}
                />
              </div>

              {/* Card Type */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Card Type
                  {typesLoading && <span style={{ marginLeft: 8, fontStyle: 'italic', fontWeight: 400, textTransform: 'none' }}>fetching…</span>}
                </div>
                <ChipRow options={CARD_TYPES} value={filterType} onChange={setFilterType} />
              </div>

              {/* Price range */}
              <div>
                <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>Price Range</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="Min"
                      value={filterMinPrice}
                      onChange={e => setFilterMinPrice(e.target.value)}
                      className="form-input"
                      style={{ width: '72px', padding: '5px 8px', fontSize: '.78rem' }}
                    />
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>–</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>$</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="Max"
                      value={filterMaxPrice}
                      onChange={e => setFilterMaxPrice(e.target.value)}
                      className="form-input"
                      style={{ width: '72px', padding: '5px 8px', fontSize: '.78rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Sell Signal */}
              {Object.keys(ckMap).length > 0 && (
                <div>
                  <div style={{ fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '8px' }}>CK Sell Signal</div>
                  <ChipRow
                    options={['strong', 'good']}
                    value={filterSignal}
                    onChange={setFilterSignal}
                    labelFn={v => v === 'strong' ? '🔥 Strong (≥80%)' : '💰 Good (≥65%)'}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Trade Binder ── */}
      {view === 'trade' && (
        <div style={{ marginTop: '16px' }}>
          {forTradeCount === 0 ? (
            <div className="empty-state" style={{ padding: '60px 20px' }}>
              <div className="empty-icon">⚖️</div>
              <p>Trade binder is empty.<br />Click any card and tap <strong>Trade Binder</strong> to add it.</p>
              <button className="btn btn-ghost" onClick={() => setView('all')} style={{ marginTop: '16px' }}>← All Cards</button>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '12px 16px', marginBottom: '16px',
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Trade Value</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                    ${tradeValue.toFixed(2)}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                    {forTradeCount} card{forTradeCount !== 1 ? 's' : ''} in binder
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={copyTradeList}>📋 Copy List</button>
              </div>

              {/* Card rows */}
              <div style={{ display: 'grid', gap: '10px' }}>
                {tradeCards.map(card => (
                  <TradeCard
                    key={card.id}
                    card={card}
                    onRemove={() => updateCard(card.id, { forTrade: false })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Empty states ── */}
      {view === 'all' && filtered.length === 0 && activeFilterCount === 0 && !search && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">💎</div>
          <p>Collection is empty.<br />Add cards manually or scan them!</p>
          <button className="btn btn-primary" onClick={() => openAddCard()} style={{ marginTop: '16px' }}>+ Add Card</button>
        </div>
      )}
      {(view === 'all' || view === 'sell') && filtered.length === 0 && (activeFilterCount > 0 || search) && (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <div className="empty-icon">🔍</div>
          <p>No cards match your filters.</p>
          <button className="btn btn-ghost" onClick={clearFilters} style={{ marginTop: '12px' }}>Clear filters</button>
        </div>
      )}
      {view === 'sell' && filtered.length === 0 && !search && activeFilterCount === 0 && (
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">🏷️</div>
          <p>Sell binder is empty.<br />Click any card and tap <strong>Sell Binder</strong> to add it.</p>
          <button className="btn btn-ghost" onClick={() => setView('all')} style={{ marginTop: '16px' }}>← All Cards</button>
        </div>
      )}

      {/* ── All Cards grid ── */}
      {view === 'all' && filtered.length > 0 && (() => {
        // Compute sell signal summary
        const ckHasData = Object.keys(ckMap).length > 0
        let strongCount = 0
        let goodCount   = 0
        let totalCKCash = 0
        if (ckHasData) {
          filtered.forEach(card => {
            const market = parseFloat(card.price) || 0
            if (market < 1) return
            const ckBuy = getCKBuyPrice(ckMap, card.name, card.isFoil, card.scryfallId)
            const signal = getSellSignal(ckBuy, market)
            if (!signal) return
            if (signal === 'strong') strongCount++
            else goodCount++
            totalCKCash += ckBuy * (card.qty || 1)
          })
        }
        const hasSignals = strongCount > 0 || goodCount > 0

        return (
          <>
            {/* Sell Signals summary bar */}
            {ckHasData && hasSignals && (
              <div style={{
                margin: '8px 0 4px',
                background: 'rgba(202,138,4,.12)',
                border: '1px solid rgba(202,138,4,.35)',
                borderRadius: '10px',
                padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                fontSize: '.75rem', color: 'var(--accent-gold)',
              }}>
                <span style={{ fontWeight: 800 }}>💰 Sell Signals</span>
                {strongCount > 0 && (
                  <button
                    onClick={() => setFilterSignal(f => f === 'strong' ? null : 'strong')}
                    style={{
                      background: filterSignal === 'strong' ? '#15803d' : '#16a34a',
                      color: '#fff', borderRadius: '4px', padding: '1px 7px',
                      fontSize: '.68rem', fontWeight: 800, border: 'none', cursor: 'pointer',
                      outline: filterSignal === 'strong' ? '2px solid #4ade80' : 'none',
                      outlineOffset: '1px', transition: 'outline .1s',
                    }}
                    title="Filter to Strong sell signals"
                  >
                    🔥 {strongCount} Strong
                  </button>
                )}
                {goodCount > 0 && (
                  <button
                    onClick={() => setFilterSignal(f => f === 'good' ? null : 'good')}
                    style={{
                      background: filterSignal === 'good' ? '#a16207' : '#ca8a04',
                      color: '#fff', borderRadius: '4px', padding: '1px 7px',
                      fontSize: '.68rem', fontWeight: 800, border: 'none', cursor: 'pointer',
                      outline: filterSignal === 'good' ? '2px solid #fde047' : 'none',
                      outlineOffset: '1px', transition: 'outline .1s',
                    }}
                    title="Filter to Good sell signals"
                  >
                    💰 {goodCount} Good
                  </button>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--accent-gold)', fontWeight: 700 }}>
                  CK cash: ${totalCKCash.toFixed(2)}
                </span>
              </div>
            )}

            <div className="collection-grid" style={{ marginTop: '8px' }}>
              {filtered.map(card => (
                <div key={card.id} className={`col-card ${card.forSale ? 'for-sale' : ''}`} onClick={() => setSelectedCard(card)} style={{ cursor: 'pointer' }}>
                  {card.img && <img src={card.img} alt={card.name} />}
                  <div className="col-card-info">
                    <div className="col-card-name">{card.name}</div>
                    <div className="col-card-set">{card.setName}</div>
                    {card.price != null && (
                      <div style={{ fontSize: '.66rem', color: 'var(--accent-gold)', fontWeight: 700, marginTop: '2px' }}>
                        ${parseFloat(card.price).toFixed(2)}
                      </div>
                    )}
                    {card.condition && (
                      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {card.condition}{card.isFoil ? ' · ✦ Foil' : ''}
                      </div>
                    )}
                  </div>
                  <span className="col-card-qty">×{card.qty}</span>

                  <button
                    className="col-card-tag-btn"
                    title={card.forSale ? 'Remove from sell list' : 'Mark for sale'}
                    onClick={(e) => { e.stopPropagation(); updateCard(card.id, { forSale: !card.forSale }) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '.9rem', padding: '2px 4px', lineHeight: 1,
                      color: card.forSale ? 'var(--accent-gold)' : 'var(--text-muted)',
                      opacity: card.forSale ? 1 : 0.4,
                      transition: 'opacity .2s, color .2s',
                      position: 'absolute', top: '6px', left: '6px',
                    }}
                  >
                    🏷️
                  </button>
                  <button className="col-card-remove" onClick={(e) => { e.stopPropagation(); handleRemove(card.id) }}>✕</button>
                  <a
                    href={getTCGPlayerLink(card.tcgplayerUrl || card.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Buy on TCGPlayer"
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', bottom: '6px', right: '6px',
                      background: 'rgba(74,222,128,.15)', color: '#4ade80',
                      borderRadius: '4px', padding: '2px 5px',
                      fontSize: '.6rem', fontWeight: 700, textDecoration: 'none',
                      lineHeight: 1.5,
                    }}
                  >
                    🛒
                  </a>

                  {(() => {
                    const market = parseFloat(card.price) || 0
                    if (market < 1) return null
                    const ckBuy = getCKBuyPrice(ckMap, card.name, card.isFoil, card.scryfallId)
                    const signal = getSellSignal(ckBuy, market)
                    if (!signal) return null
                    return (
                      <div style={{
                        position: 'absolute', bottom: '6px', left: '6px',
                        background: signal === 'strong' ? '#16a34a' : '#ca8a04',
                        color: '#fff', borderRadius: '4px',
                        fontSize: '.55rem', fontWeight: 800,
                        padding: '2px 5px', letterSpacing: '.3px',
                        textTransform: 'uppercase',
                      }}>
                        {signal === 'strong' ? '🔥 Sell' : '💰 Sell?'}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </>
        )
      })()}

      {/* ── Sell List ── */}
      {view === 'sell' && filtered.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '10px 14px',
            display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', fontSize: '.72rem', color: 'var(--text-muted)',
          }}>
            <span>🏪 <strong style={{ color: 'var(--text-secondary)' }}>TCGPlayer</strong> — list for sale</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span>💎 <strong style={{ color: '#4ade80' }}>CK</strong> — Card Kingdom buylist</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span>🏰 <strong style={{ color: '#60a5fa' }}>ABU</strong> — ABU Games buylist</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span>⭐ <strong style={{ color: '#a78bfa' }}>SCG</strong> — Star City Games buylist {Object.keys(scgMap).length === 0 && <span style={{ opacity: .5 }}>(loading…)</span>}</span>
          </div>

          {filtered.map(card => (
            <SellCard
              key={card.id}
              card={card}
              ckBuyPrice={Object.keys(ckMap).length > 0 ? getCKBuyPrice(ckMap, card.name, card.isFoil, card.scryfallId) : null}
              abuBuyPrice={Object.keys(abuMap).length > 0 ? getABUBuyPrice(abuMap, card.name, card.setName) : null}
              scgBuyPrice={Object.keys(scgMap).length > 0 ? getSCGBuyPrice(scgMap, card.name, card.setName) : null}
              scgHotlist={Object.keys(scgMap).length > 0 ? isSCGHotlist(scgMap, card.name, card.setName) : false}
              onUpdatePrice={p => updateCard(card.id, { salePrice: p })}
              onUpdateQty={q  => updateCard(card.id, { sellQty: q })}
              onRemoveFromSell={() => updateCard(card.id, { forSale: false })}
            />
          ))}
        </div>
      )}
      {selectedCard && (
        <CollectionCardModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onRemove={(id) => { handleRemove(id); setSelectedCard(null) }}
          onUpdateCard={updateCard}
        />
      )}
      {showBulk && (
        <BulkImportModal
          onClose={() => setShowBulk(false)}
          collection={collection}
          setCollection={setCollection}
          user={user}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ── Sell List row ─────────────────────────────────────────────────────────────

function SellCard({ card, onUpdatePrice, onUpdateQty, onRemoveFromSell, ckBuyPrice, abuBuyPrice, scgBuyPrice, scgHotlist }) {
  const tcgUrl   = getTCGPlayerLink(card.name)
  const suggested = suggestPrice(parseFloat(card.price) || 0)
  const market    = parseFloat(card.price) || 0

  // Best buylist offer across all venues
  const buylistOffers = [
    ckBuyPrice  != null ? { label: 'CK',  price: ckBuyPrice,  hot: ckBuyPrice / (market || Infinity) >= 0.75 } : null,
    abuBuyPrice != null ? { label: 'ABU', price: abuBuyPrice, hot: abuBuyPrice / (market || Infinity) >= 0.75 } : null,
    scgBuyPrice != null ? { label: 'SCG', price: scgBuyPrice, hot: scgHotlist || scgBuyPrice / (market || Infinity) >= 0.75 } : null,
  ].filter(Boolean)

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '12px 14px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: '10px',
    }}>
      {card.img
        ? <img src={card.img} alt={card.name} style={{ width: '42px', borderRadius: '4px', flexShrink: 0 }} />
        : <div style={{ width: '42px', height: '60px', background: 'var(--bg-secondary)', borderRadius: '4px', flexShrink: 0 }} />
      }

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.86rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.name}</div>
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {card.setName} · <span style={{ color: 'var(--text-secondary)' }}>{card.condition || 'NM'}</span>
          {card.isFoil && <span style={{ color: 'var(--accent-purple)', marginLeft: '4px' }}>✦ Foil</span>}
        </div>
        {card.price != null && (
          <div style={{ fontSize: '.7rem', color: 'var(--accent-gold)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span>Market: ${market.toFixed(2)}</span>
            {suggested != null && (
              <span style={{ color: 'var(--accent-teal)' }}>Suggested: ${suggested.toFixed(2)}</span>
            )}
            {buylistOffers.map(o => (
              <span key={o.label} style={{ color: '#4ade80', fontWeight: 700 }}>
                {o.label}: ${o.price.toFixed(2)}{o.hot ? ' 🔥' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
        <div>
          <label style={{ display: 'block', fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '3px' }}>Price</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>$</span>
            <input
              type="number" className="form-input"
              min="0.01" step="0.01"
              placeholder={suggested?.toFixed(2) || card.price?.toFixed?.(2) || '0.99'}
              defaultValue={card.salePrice || ''}
              onBlur={e => onUpdatePrice(e.target.value)}
              style={{ padding: '4px 6px', fontSize: '.78rem', width: '64px' }}
            />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '3px' }}>Qty</label>
          <input
            type="number" className="form-input"
            min="1" max={card.qty}
            defaultValue={card.sellQty || 1}
            onBlur={e => onUpdateQty(parseInt(e.target.value, 10) || 1)}
            style={{ padding: '4px 6px', fontSize: '.78rem', width: '48px' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexShrink: 0 }}>
        <a
          href={tcgUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
          style={{ fontSize: '.68rem', textAlign: 'center', textDecoration: 'none', display: 'block' }}
        >
          🏪 TCGPlayer →
        </a>
        {ckBuyPrice != null && (
          <a
            href={`https://www.cardkingdom.com/purchasing/mtg_singles?filter[search]=name&filter[name]=${encodeURIComponent(card.name)}`}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '.68rem', textAlign: 'center', textDecoration: 'none', display: 'block', color: '#4ade80', borderColor: 'rgba(74,222,128,.3)' }}
          >
            💎 CK ${ckBuyPrice.toFixed(2)} →
          </a>
        )}
        {abuBuyPrice != null && (
          <a
            href={getABUBuylistLink(card.name)}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '.68rem', textAlign: 'center', textDecoration: 'none', display: 'block', color: '#60a5fa', borderColor: 'rgba(96,165,250,.3)' }}
          >
            🏰 ABU ${abuBuyPrice.toFixed(2)} →
          </a>
        )}
        {scgBuyPrice != null && (
          <a
            href={getSCGBuylistLink()}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '.68rem', textAlign: 'center', textDecoration: 'none', display: 'block', color: scgHotlist ? '#f97316' : '#a78bfa', borderColor: scgHotlist ? 'rgba(249,115,22,.3)' : 'rgba(167,139,250,.3)' }}
          >
            {scgHotlist ? '🔥' : '⭐'} SCG ${scgBuyPrice.toFixed(2)} →
          </a>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onRemoveFromSell}
          style={{ fontSize: '.72rem', padding: '4px 8px' }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Trade Binder row ──────────────────────────────────────────────────────────
function TradeCard({ card, onRemove }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '12px 14px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: '10px',
    }}>
      {card.img
        ? <img src={card.img} alt={card.name} style={{ width: '42px', borderRadius: '4px', flexShrink: 0 }} />
        : <div style={{ width: '42px', height: '60px', background: 'var(--bg-secondary)', borderRadius: '4px', flexShrink: 0 }} />
      }
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.86rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{card.name}</div>
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          {card.setName} · <span style={{ color: 'var(--text-secondary)' }}>{card.condition || 'NM'}</span>
          {card.isFoil && <span style={{ color: 'var(--accent-purple)', marginLeft: '4px' }}>✦ Foil</span>}
        </div>
        {card.qty > 1 && (
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 1 }}>×{card.qty} copies</div>
        )}
      </div>
      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--accent-gold)', flexShrink: 0 }}>
        {card.price != null ? `$${parseFloat(card.price).toFixed(2)}` : '—'}
      </div>
      <button
        onClick={onRemove}
        title="Remove from trade binder"
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px',
          color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.78rem',
          flexShrink: 0, transition: 'color .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        ✕
      </button>
    </div>
  )
}
