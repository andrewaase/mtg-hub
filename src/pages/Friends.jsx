import { useState, useEffect } from 'react'
import { hasSupabase, supabase } from '../lib/supabase'
import {
  getFriends, getPendingRequests, sendFriendRequest, acceptFriendRequest,
  findUserByEmail, getFriendCollection, createNotification,
  removeFriend, createTrade, getTrades, respondTrade, reportUser,
} from '../lib/db'

function displayName(p) {
  return p?.username || p?.email?.split('@')[0] || p?.displayName || '(unknown)'
}
function initials(p) { return (displayName(p)[0] || '?').toUpperCase() }
function fmt(price) { return price != null ? '$' + Number(price).toFixed(2) : '—' }
function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG']

export default function Friends({ user, showToast, isActive }) {
  const [tab, setTab] = useState('friends')

  // Friends list
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading, setLoading] = useState(false)

  // Add friend
  const [emailInput, setEmailInput] = useState('')
  const [foundUser, setFoundUser] = useState(null)
  const [findStatus, setFindStatus] = useState('')

  // Browse collection
  const [browsingFriend, setBrowsingFriend] = useState(null)
  const [friendCollection, setFriendCollection] = useState([])
  const [collectionLoading, setCollectionLoading] = useState(false)
  const [collectionSearch, setCollectionSearch] = useState('')

  // Cart
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [tradeMessage, setTradeMessage] = useState('')
  const [proposing, setProposing] = useState(false)

  // Trades tab
  const [trades, setTrades] = useState([])
  const [tradesLoading, setTradesLoading] = useState(false)
  const [tradesLoaded, setTradesLoaded] = useState(false)

  // Report
  const [reportTarget, setReportTarget] = useState(null) // { id, email, name }
  const [reportReason, setReportReason] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)

  useEffect(() => {
    if (user && hasSupabase) loadFriendsData()
  }, [user, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleTabEvent(e) { setTab(e.detail) }
    window.addEventListener('friends-set-tab', handleTabEvent)
    return () => window.removeEventListener('friends-set-tab', handleTabEvent)
  }, [])

  useEffect(() => {
    if (tab === 'trades' && user && hasSupabase && !tradesLoaded) loadTrades()
  }, [tab, user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  const loadFriendsData = async () => {
    if (!user) return
    setLoading(true)
    const token = await getToken()
    const [f, p] = await Promise.all([
      getFriends(user.id, token),
      getPendingRequests(user.id, token),
    ])
    setFriends(f)
    setPendingRequests(p)
    setLoading(false)
  }

  const loadTrades = async () => {
    setTradesLoading(true)
    const token = await getToken()
    const t = await getTrades(token)
    setTrades(t)
    setTradesLoaded(true)
    setTradesLoading(false)
  }

  //  Add friend 
  const handleFindUser = async () => {
    const email = emailInput.trim().toLowerCase()
    if (!email || !email.includes('@')) { showToast('Enter a valid email address'); return }
    setFindStatus('searching')
    setFoundUser(null)
    try {
      const token = await getToken()
      const result = await findUserByEmail(email, token)
      if (result.self) { setFindStatus('self'); return }
      if (!result.found) { setFindStatus('not-found'); return }
      if (friends.some(f => f.friend?.id === result.user.id)) { setFindStatus('already'); setFoundUser(result.user); return }
      setFoundUser(result.user)
      setFindStatus('found')
    } catch { setFindStatus('not-found') }
  }

  const handleSendRequest = async () => {
    if (!foundUser) return
    const token = await getToken()
    const senderName = user.email?.split('@')[0] || 'Someone'
    const result = await sendFriendRequest(user.id, foundUser.id)
    if (result.mutual) {
      showToast(` You and ${foundUser.displayName} are now friends!`)
      createNotification(foundUser.id, 'friend_accepted', `${senderName} accepted your friend request`, `You and ${senderName} are now friends.`, { fromUserId: user.id }, token)
    } else if (result.alreadyFriends) {
      showToast(`You're already friends with ${foundUser.displayName}`)
    } else {
      showToast('Friend request sent!')
      createNotification(foundUser.id, 'friend_request', `${senderName} sent you a friend request`, 'Tap Accept to connect.', { fromUserId: user.id, requestId: result.requestId, fromName: senderName }, token)
    }
    setEmailInput(''); setFoundUser(null); setFindStatus('')
    loadFriendsData()
  }

  const handleAcceptRequest = async (requestId, requesterId) => {
    const token = await getToken()
    const myName = user.email?.split('@')[0] || 'Someone'
    await acceptFriendRequest(requestId)
    loadFriendsData()
    showToast('Friend request accepted!')
    if (requesterId) createNotification(requesterId, 'friend_accepted', `${myName} accepted your friend request`, `You and ${myName} are now friends.`, { fromUserId: user.id }, token)
  }

  //  Remove friend 
  const handleRemoveFriend = async (friendRow) => {
    if (!confirm(`Remove ${displayName(friendRow.friend)} from your friends?`)) return
    const token = await getToken()
    const ok = await removeFriend(friendRow.id, token)
    if (ok) {
      setFriends(prev => prev.filter(f => f.id !== friendRow.id))
      if (browsingFriend?.id === friendRow.id) { setBrowsingFriend(null); setFriendCollection([]); setCart([]) }
      showToast('Friend removed.')
    } else {
      showToast('Failed to remove friend.')
    }
  }

  //  Browse collection 
  const handleBrowse = async (friendRow) => {
    setBrowsingFriend(friendRow)
    setCart([])
    setCartOpen(false)
    setTradeMessage('')
    setCollectionSearch('')
    setTab('browse')
    setCollectionLoading(true)
    const token = await getToken()
    const data = await getFriendCollection(friendRow.friend.id, token)
    setFriendCollection(data)
    setCollectionLoading(false)
  }

  //  Cart 
  const handleAddToCart = (card) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === card.id)
      if (existing) {
        return prev.map(c => c.id === card.id
          ? { ...c, selectedQty: Math.min(c.selectedQty + 1, c.qty) }
          : c)
      }
      return [...prev, { ...card, selectedQty: 1 }]
    })
  }

  const handleRemoveFromCart = (cardId) => setCart(prev => prev.filter(c => c.id !== cardId))

  const handleUpdateCartItem = (cardId, updates) =>
    setCart(prev => prev.map(c => c.id === cardId ? { ...c, ...updates } : c))

  const cartTotal = cart.reduce((sum, c) => sum + (c.price || 0) * c.selectedQty, 0)

  const handleProposeTrade = async () => {
    if (!cart.length || !browsingFriend || proposing) return
    setProposing(true)
    const token = await getToken()
    const myName = user.email?.split('@')[0] || 'Someone'
    const recipientId = browsingFriend.friend.id
    try {
      const result = await createTrade(
        recipientId,
        cart.map(c => ({ name: c.name, qty: c.selectedQty, condition: c.condition, isFoil: c.isFoil, price: c.price, img: c.img })),
        tradeMessage,
        token,
      )
      if (result.ok) {
        const summary = cart.length === 1 ? cart[0].name : `${cart.length} cards`
        createNotification(recipientId, 'trade_proposed', `${myName} proposed a trade`, `Requesting: ${summary} · ${fmt(cartTotal)}`, { fromUserId: user.id, fromName: myName, tradeId: result.tradeId }, token)
        showToast('Trade proposal sent!')
        setCart([]); setTradeMessage(''); setCartOpen(false)
        setTradesLoaded(false) // force reload on next trades tab visit
      } else {
        showToast('Failed to send trade — make sure the trades table is set up in Supabase.')
      }
    } catch { showToast('Failed to send trade proposal.') }
    setProposing(false)
  }

  //  Respond to trade 
  const handleRespondTrade = async (trade, action, opts = {}) => {
    const token = await getToken()
    const myName = user.email?.split('@')[0] || 'Someone'
    const result = await respondTrade(trade.id, action, token, opts)
    if (result.ok) {
      setTrades(prev => prev.map(t => t.id === trade.id ? { ...t, status: action } : t))
      showToast(action === 'accepted' ? 'Trade accepted!' : 'Trade declined.')
      createNotification(
        trade.sender_id,
        action === 'accepted' ? 'trade_accepted' : 'trade_declined',
        action === 'accepted' ? `${myName} accepted your trade proposal!` : `${myName} declined your trade proposal`,
        action === 'accepted' ? 'Reach out to arrange the exchange.' : null,
        { fromUserId: user.id },
        token,
      )
    }
  }

  //  Report user 
  const handleSubmitReport = async () => {
    if (!reportReason.trim() || !reportTarget) return
    setReportSubmitting(true)
    const token = await getToken()
    await reportUser({ reportedUserId: reportTarget.id, reportedEmail: reportTarget.email, reason: reportReason }, token)
    setReportSubmitting(false)
    setReportTarget(null)
    setReportReason('')
    showToast('Report submitted. Thank you.')
  }

  //  Derived 
  const filteredCollection = friendCollection.filter(c =>
    !collectionSearch || c.name?.toLowerCase().includes(collectionSearch.toLowerCase())
  )
  const incomingTrades = trades.filter(t => t.recipient_id === user?.id)
  const outgoingTrades = trades.filter(t => t.sender_id === user?.id)

  // 
  if (!hasSupabase) return (
    <div className="card">
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}></div>
        <div style={{ fontSize: '.95rem', color: 'var(--text-secondary)', marginBottom: 16 }}><strong>Friends & Trades</strong> requires a free account.</div>
      </div>
    </div>
  )
  if (!user) return (
    <div className="card"><div style={{ padding: '40px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: '.95rem', color: 'var(--text-secondary)' }}>Sign in to access Friends & Trades</p>
    </div></div>
  )

  return (
    <div>
      {/*  Tabs  */}
      <div className="tabs">
        <button className={`tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}> My Friends</button>
        <button className={`tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}> Browse & Trade</button>
        <button className={`tab ${tab === 'trades' ? 'active' : ''}`} onClick={() => setTab('trades')}>↔ Trade Proposals</button>
      </div>

      {/*  MY FRIENDS  */}
      {tab === 'friends' && (
        <div>
          {/* Add friend */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Add Friend</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="email" className="form-input" placeholder="Enter their email address…" value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setFindStatus(''); setFoundUser(null) }}
                onKeyDown={e => e.key === 'Enter' && handleFindUser()} style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={handleFindUser} disabled={findStatus === 'searching'} style={{ flexShrink: 0 }}>
                {findStatus === 'searching' ? '…' : 'Find'}
              </button>
            </div>
            {findStatus === 'not-found' && <div style={{ marginTop: 10, fontSize: '.82rem', color: '#f87171' }}>No account found with that email.</div>}
            {findStatus === 'self'      && <div style={{ marginTop: 10, fontSize: '.82rem', color: 'var(--text-muted)' }}>That's you!</div>}
            {findStatus === 'already'   && foundUser && <div style={{ marginTop: 10, fontSize: '.82rem', color: 'var(--text-muted)' }}>Already friends with {foundUser.displayName}.</div>}
            {findStatus === 'found'     && foundUser && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(74,222,128,.06)', border: '1px solid rgba(74,222,128,.2)' }}>
                <div className="user-avatar" style={{ backgroundColor: '#c9a84c', width: 36, height: 36, fontSize: '.9rem' }}>{initials(foundUser)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{foundUser.displayName}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{foundUser.email}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleSendRequest}>+ Add Friend</button>
              </div>
            )}
          </div>

          {/* Friends list */}
          <div className="section-title">My Friends</div>
          {loading ? (
            <div className="card"><div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div></div>
          ) : friends.length === 0 ? (
            <div className="card"><div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No friends yet. Add someone by their email above!</div></div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {friends.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div className="user-avatar" style={{ backgroundColor: f.friend?.avatar_color || '#c9a84c' }}>{initials(f.friend)}</div>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: '.9rem' }}>{displayName(f.friend)}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleBrowse(f)}
                      style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(201,168,76,.12)', border: '1px solid rgba(201,168,76,.3)', color: 'var(--accent-gold)', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}
                    >
                       Browse
                    </button>
                    <button
                      onClick={() => handleRemoveFriend(f)}
                      style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => { setReportTarget({ id: f.friend.id, email: f.friend.email, name: displayName(f.friend) }); setReportReason('') }}
                      title="Report this user"
                      style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.18)', color: '#fbbf24', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}
                    >
                       Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div className="section-title">Pending Requests</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {pendingRequests.map(req => (
                  <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
                    <div className="user-avatar" style={{ backgroundColor: req.requester?.avatar_color || '#c9a84c' }}>{initials(req.requester)}</div>
                    <div style={{ flex: 1, fontWeight: 600, fontSize: '.9rem' }}>{displayName(req.requester)}</div>
                    <button className="btn btn-primary btn-sm" onClick={() => handleAcceptRequest(req.id, req.requester?.id)}>Accept</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/*  BROWSE & TRADE  */}
      {tab === 'browse' && (
        <div>
          {!browsingFriend ? (
            <div className="card">
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.88rem' }}>
                Click <strong> Browse</strong> on a friend's card to see their collection and propose a trade.
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={() => { setBrowsingFriend(null); setFriendCollection([]); setCart([]); setCartOpen(false) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.85rem', padding: '4px 8px' }}>
                  ← Back
                </button>
                <span style={{ fontWeight: 700, fontSize: '.95rem' }}>
                  {displayName(browsingFriend.friend)}'s Collection
                </span>
                <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginLeft: 4 }}>
                  {friendCollection.length} cards
                </span>
              </div>

              {/* Search */}
              <input className="form-input" placeholder="Search cards…" value={collectionSearch}
                onChange={e => setCollectionSearch(e.target.value)}
                style={{ marginBottom: 16, width: '100%' }} />

              {/* spacer so cards aren't hidden behind the fixed bar */}
              {cart.length > 0 && <div style={{ height: 80 }} />}

              {/* Collection grid */}
              {collectionLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading collection…</div>
              ) : filteredCollection.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {collectionSearch ? 'No cards match your search.' : 'This collection is empty.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  {filteredCollection.map((card, i) => {
                    const inCart = cart.find(c => c.id === card.id)
                    return (
                      <div key={i} style={{ background: 'var(--bg-card)', border: `1px solid ${inCart ? 'rgba(201,168,76,.5)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {card.img
                          ? <img src={card.img} alt={card.name} style={{ width: '100%', aspectRatio: '63/88', objectFit: 'cover' }} />
                          : <div style={{ aspectRatio: '63/88', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', color: 'var(--text-muted)' }}>No image</div>
                        }
                        <div style={{ padding: '8px 8px 10px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <div style={{ fontSize: '.75rem', fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>{card.name}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                            {card.condition && <span style={{ fontSize: '.62rem', padding: '1px 5px', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{card.condition}</span>}
                            {card.isFoil   && <span style={{ fontSize: '.62rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(201,168,76,.15)', color: 'var(--accent-gold)' }}>Foil</span>}
                            <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>×{card.qty}</span>
                          </div>
                          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: 6, minHeight: '1em' }}>
                            {card.price != null ? fmt(card.price) : ''}
                          </div>
                          <button
                            onClick={() => !inCart && handleAddToCart(card)}
                            style={{
                              width: '100%', padding: '7px 0', borderRadius: 7, fontSize: '.72rem', fontWeight: 700,
                              cursor: inCart ? 'default' : 'pointer',
                              background: inCart ? 'rgba(201,168,76,.15)' : 'var(--accent-gold)',
                              border: `1px solid ${inCart ? 'rgba(201,168,76,.5)' : 'transparent'}`,
                              color: inCart ? 'var(--accent-gold)' : '#000',
                              transition: 'all .15s', marginTop: 'auto',
                            }}
                          >
                            {inCart ? '✓ In Trade' : '+ Add to Trade'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/*  Fixed trade cart bar  */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 150,
        transform: cart.length > 0 ? 'translateY(0)' : 'translateY(110%)',
        transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)',
        pointerEvents: cart.length > 0 ? 'auto' : 'none',
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto 12px', padding: '0 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(15,12,5,.92)',
            border: '1px solid rgba(201,168,76,.45)',
            borderRadius: 16, padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(201,168,76,.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: 'var(--accent-gold)', color: '#000',
                borderRadius: '50%', width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.72rem', fontWeight: 900, flexShrink: 0,
              }}>{cart.length}</div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1 }}>
                  {cart.length === 1 ? '1 card' : `${cart.length} cards`}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-gold)', lineHeight: 1.3 }}>
                  {fmt(cartTotal)}
                </div>
              </div>
            </div>
            <button
              onClick={() => setCartOpen(true)}
              style={{
                padding: '10px 22px', borderRadius: 12, border: 'none',
                background: 'var(--accent-gold)', color: '#000',
                fontWeight: 800, fontSize: '.88rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 12px rgba(201,168,76,.35)',
              }}
            >
               View Trade →
            </button>
          </div>
        </div>
      </div>

      {/*  Trade drawer  */}
      {cartOpen && (
        <>
          <div onClick={() => setCartOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(380px, 100vw)',
            background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
            zIndex: 201, display: 'flex', flexDirection: 'column',
            boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
          }}>
            {/* Drawer header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}> Trade Proposal</div>
                {browsingFriend && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>for {displayName(browsingFriend.friend)}</div>}
              </div>
              <button onClick={() => setCartOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-muted)', padding: 4 }}>✕</button>
            </div>

            {/* Drawer items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              {cart.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  {c.img && <img src={c.img} alt={c.name} style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: 6 }}>{c.name}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <select value={c.condition} onChange={e => handleUpdateCartItem(c.id, { condition: e.target.value })}
                        style={{ fontSize: '.72rem', padding: '3px 6px', borderRadius: 5, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        {CONDITIONS.map(cond => <option key={cond} value={cond}>{cond}</option>)}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={c.isFoil} onChange={e => handleUpdateCartItem(c.id, { isFoil: e.target.checked })} style={{ width: 13, height: 13 }} />
                        Foil
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => handleUpdateCartItem(c.id, { selectedQty: Math.max(1, c.selectedQty - 1) })}
                          style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>−</button>
                        <span style={{ fontSize: '.85rem', minWidth: 18, textAlign: 'center', fontWeight: 600 }}>{c.selectedQty}</span>
                        <button onClick={() => handleUpdateCartItem(c.id, { selectedQty: Math.min(c.qty, c.selectedQty + 1) })}
                          style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', cursor: 'pointer', fontSize: '.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>+</button>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ fontSize: '.88rem', fontWeight: 700 }}>{c.price != null ? fmt(c.price * c.selectedQty) : '—'}</div>
                    <button onClick={() => handleRemoveFromCart(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.72rem', color: '#f87171' }}>✕ Remove</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <input className="form-input" placeholder="Add a message (optional)…" value={tradeMessage}
                onChange={e => setTradeMessage(e.target.value)}
                style={{ marginBottom: 12, fontSize: '.82rem', width: '100%' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{cart.length} card{cart.length !== 1 ? 's' : ''}</span>
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>{fmt(cartTotal)}</span>
              </div>
              <button
                onClick={handleProposeTrade}
                disabled={proposing}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                  background: 'var(--accent-gold)', color: '#000',
                  fontWeight: 800, fontSize: '.95rem', cursor: proposing ? 'wait' : 'pointer',
                  opacity: proposing ? 0.7 : 1,
                }}
              >
                {proposing ? 'Sending…' : ' Propose Trade'}
              </button>
            </div>
          </div>
        </>
      )}

      {/*  Report modal  */}
      {reportTarget && (
        <>
          <div onClick={() => setReportTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 400 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 'min(420px, 92vw)', background: 'var(--bg-card)',
            border: '1px solid rgba(251,191,36,.3)', borderRadius: 16,
            zIndex: 401, padding: '24px 24px 20px',
            boxShadow: '0 16px 48px rgba(0,0,0,.6)',
          }}>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 4 }}> Report User</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              Reporting <strong>{reportTarget.name}</strong> ({reportTarget.email})
            </div>
            <textarea
              autoFocus
              value={reportReason}
              onChange={e => setReportReason(e.target.value)}
              placeholder="Describe the issue — e.g. scam attempt, abusive messages, suspicious behaviour…"
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 8, resize: 'vertical',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', fontSize: '.82rem', lineHeight: 1.5,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setReportTarget(null)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '.8rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReport}
                disabled={!reportReason.trim() || reportSubmitting}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: reportReason.trim() ? 'rgba(251,191,36,.85)' : 'rgba(251,191,36,.25)',
                  color: '#000', fontWeight: 700, fontSize: '.8rem',
                  cursor: reportReason.trim() && !reportSubmitting ? 'pointer' : 'default',
                  opacity: reportSubmitting ? 0.6 : 1,
                }}
              >
                {reportSubmitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </div>
        </>
      )}

      {/*  TRADE PROPOSALS  */}
      {tab === 'trades' && (
        <div>
          {/* Safety notice */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 14px', marginBottom: 16, borderRadius: 10,
            background: 'rgba(251,191,36,.07)', border: '1px solid rgba(251,191,36,.25)',
          }}>
            <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: 1 }}></span>
            <p style={{ margin: 0, fontSize: '.76rem', color: '#fcd34d', lineHeight: 1.5 }}>
              <strong>Trade safely.</strong> Only exchange cards in person or with trusted individuals. Vaulted Singles does not mediate disputes or guarantee trades. If a user behaves suspiciously, use the <strong>Report</strong> button on their friend card.
            </p>
          </div>

          {tradesLoading ? (
            <div className="card"><div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div></div>
          ) : (
            <>
              {/* Incoming */}
              <div className="section-title" style={{ marginBottom: 10 }}>Incoming Proposals</div>
              {incomingTrades.length === 0 ? (
                <div className="card" style={{ marginBottom: 20 }}><div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>No incoming trade proposals.</div></div>
              ) : (
                <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
                  {incomingTrades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} isIncoming perspective="recipient"
                      onRespond={handleRespondTrade} />
                  ))}
                </div>
              )}

              {/* Outgoing */}
              <div className="section-title" style={{ marginBottom: 10 }}>Sent Proposals</div>
              {outgoingTrades.length === 0 ? (
                <div className="card"><div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>No outgoing trade proposals.</div></div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {outgoingTrades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} isIncoming={false} perspective="sender"
                      onRespond={handleRespondTrade} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TradeCard({ trade, perspective, onRespond }) {
  const [removeFromMine, setRemoveFromMine] = useState(false)
  const [addToTheirs, setAddToTheirs]       = useState(false)
  const total = (trade.items || []).reduce((s, i) => s + (i.price || 0) * i.qty, 0)
  const statusColor = { pending: '#facc15', accepted: '#4ade80', declined: '#f87171' }[trade.status] || 'var(--text-muted)'

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div>
          <span style={{ fontSize: '.82rem', fontWeight: 700 }}>
            {perspective === 'recipient' ? `From ${trade.senderName}` : `To ${trade.recipientName}`}
          </span>
          <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginLeft: 8 }}>{fmtDate(trade.created_at)}</span>
        </div>
        <span style={{ fontSize: '.72rem', fontWeight: 700, color: statusColor, textTransform: 'capitalize', padding: '2px 8px', borderRadius: 99, background: `${statusColor}18` }}>
          {trade.status}
        </span>
      </div>

      {/* Items */}
      <div style={{ padding: '10px 16px' }}>
        {(trade.items || []).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: i < trade.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
            {item.img && <img src={item.img} alt={item.name} style={{ width: 28, height: 39, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{item.card_name}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                {[item.condition, item.is_foil && 'Foil', `×${item.qty}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ fontSize: '.78rem', fontWeight: 600 }}>{item.price ? fmt(item.price * item.qty) : '—'}</div>
          </div>
        ))}

        {trade.message && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-secondary)', fontSize: '.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            "{trade.message}"
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 700 }}>Total: {fmt(total)}</span>
          </div>

          {perspective === 'recipient' && trade.status === 'pending' && (
            <>
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={removeFromMine} onChange={e => setRemoveFromMine(e.target.checked)} style={{ width: 13, height: 13, flexShrink: 0 }} />
                  Remove from my collection
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={addToTheirs} onChange={e => setAddToTheirs(e.target.checked)} style={{ width: 13, height: 13, flexShrink: 0 }} />
                  Add to {trade.senderName}'s collection
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => onRespond(trade, 'accepted', { removeFromMine, addToTheirs })}
                  style={{ padding: '5px 14px', borderRadius: 8, background: 'rgba(74,222,128,.15)', border: '1px solid rgba(74,222,128,.3)', color: '#4ade80', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer' }}>
                  ✓ Accept
                </button>
                <button onClick={() => onRespond(trade, 'declined')}
                  style={{ padding: '5px 14px', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)', color: '#f87171', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer' }}>
                  ✕ Decline
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
