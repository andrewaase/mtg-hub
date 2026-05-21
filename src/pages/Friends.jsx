import { useState, useEffect } from 'react'
import { hasSupabase, supabase } from '../lib/supabase'
import { getFriends, getPendingRequests, sendFriendRequest, acceptFriendRequest, findUserByEmail, getFriendCollection, getWantList, addWant, removeWant, createNotification } from '../lib/db'

function displayName(friend) {
  return friend?.username || friend?.email?.split('@')[0] || friend?.displayName || '(unknown)'
}

function initials(friend) {
  return (displayName(friend)[0] || '?').toUpperCase()
}

export default function Friends({ user, showToast, isActive }) {
  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [friendCollection, setFriendCollection] = useState([])
  const [wantList, setWantList] = useState([])
  const [emailInput, setEmailInput] = useState('')
  const [foundUser, setFoundUser] = useState(null)   // { id, displayName, email }
  const [findStatus, setFindStatus] = useState('')    // '' | 'searching' | 'found' | 'not-found' | 'self' | 'already'
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user && hasSupabase) {
      loadFriendsData()
    }
  }, [user, tab, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFriendsData = async () => {
    if (!user) return
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    console.log('[loadFriendsData] userId:', user.id, 'hasToken:', !!token)
    const [f, p, w] = await Promise.all([
      getFriends(user.id, token),
      getPendingRequests(user.id, token),
      getWantList(user.id),
    ])
    console.log('[loadFriendsData] result — friends:', f, 'pending:', p)
    setFriends(f)
    setPendingRequests(p)
    setWantList(w)
    setLoading(false)

    // Debug: also call the raw debug endpoint so we can see the DB state
    if (token) {
      try {
        const dbg = await fetch('/.netlify/functions/debug-friends', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const dbgText = await dbg.text()
        console.log('[debug-friends] status:', dbg.status, 'body:', dbgText)
      } catch (e) {
        console.error('[debug-friends] error:', e)
      }
    }
  }

  const handleFindUser = async () => {
    const email = emailInput.trim().toLowerCase()
    if (!email || !email.includes('@')) { showToast('Enter a valid email address'); return }
    setFindStatus('searching')
    setFoundUser(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await findUserByEmail(email, session.access_token)
      if (result.self) { setFindStatus('self'); return }
      if (!result.found) { setFindStatus('not-found'); return }
      // Check if already a friend or request already sent
      const alreadyFriend = friends.some(f => f.friend?.id === result.user.id)
      if (alreadyFriend) { setFindStatus('already'); setFoundUser(result.user); return }
      setFoundUser(result.user)
      setFindStatus('found')
    } catch {
      setFindStatus('not-found')
    }
  }

  const handleSendRequest = async () => {
    if (!foundUser) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const senderName = user.email?.split('@')[0] || 'Someone'

    const result = await sendFriendRequest(user.id, foundUser.id)

    if (result.mutual) {
      // Both users had pending requests — auto-accepted
      showToast(`✅ You and ${foundUser.displayName} are now friends!`)
      // Notify the other person their request was accepted
      createNotification(
        foundUser.id, 'friend_accepted',
        `${senderName} accepted your friend request`,
        `You and ${senderName} are now friends.`,
        { fromUserId: user.id },
        token,
      )
    } else if (result.alreadyFriends) {
      showToast(`You're already friends with ${foundUser.displayName}`)
    } else {
      showToast('Friend request sent!')
      // Notify the recipient — include requestId so they can accept from the bell
      createNotification(
        foundUser.id, 'friend_request',
        `${senderName} sent you a friend request`,
        `Tap Accept to connect.`,
        { fromUserId: user.id, requestId: result.requestId, fromName: senderName },
        token,
      )
    }

    setEmailInput('')
    setFoundUser(null)
    setFindStatus('')
    loadFriendsData()
  }

  const handleAcceptRequest = async (requestId, requesterId) => {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const myName = user.email?.split('@')[0] || 'Someone'

    await acceptFriendRequest(requestId)
    loadFriendsData()
    showToast('Friend request accepted!')

    // Notify the person whose request was accepted
    if (requesterId) {
      createNotification(
        requesterId, 'friend_accepted',
        `${myName} accepted your friend request`,
        `You and ${myName} are now friends.`,
        { fromUserId: user.id },
        token,
      )
    }
  }

  const handleSelectFriend = async (friendId) => {
    setSelectedFriend(friendId)
    const [collection, wants] = await Promise.all([
      getFriendCollection(friendId),
      getWantList(friendId),
    ])
    setFriendCollection(collection)
    setWantList(wants)
  }

  const handleAddWant = async (cardName) => {
    await addWant(cardName, user.id)
    loadFriendsData()
    showToast('Added to want list!')
  }

  const handleRemoveWant = async (cardName) => {
    await removeWant(cardName, user.id)
    loadFriendsData()
  }

  if (!hasSupabase) {
    return (
      <div className="card">
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '16px' }}>🤝</div>
          <div style={{ fontSize: '.95rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            <strong>Friends & Trades</strong> requires a free account.
          </div>
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            This feature needs Supabase to sync data across devices and share with friends.<br/>
            Set up your account to unlock: friend connections, collection sharing, and trade matching.
          </p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="card">
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: '.95rem', color: 'var(--text-secondary)' }}>Sign in to access Friends & Trades</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="tabs">
        <button className={`tab ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
          👥 My Friends
        </button>
        <button className={`tab ${tab === 'collections' ? 'active' : ''}`} onClick={() => setTab('collections')}>
          📦 Browse Collections
        </button>
        <button className={`tab ${tab === 'trades' ? 'active' : ''}`} onClick={() => setTab('trades')}>
          ↔️ Trade Matcher
        </button>
      </div>

      {tab === 'friends' && (
        <div>
          {/* ── Add friend by email ── */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="section-title">Add Friend</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                className="form-input"
                placeholder="Enter their email address…"
                value={emailInput}
                onChange={e => { setEmailInput(e.target.value); setFindStatus(''); setFoundUser(null) }}
                onKeyDown={e => e.key === 'Enter' && handleFindUser()}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleFindUser}
                disabled={findStatus === 'searching'}
                style={{ flexShrink: 0 }}
              >
                {findStatus === 'searching' ? '…' : 'Find'}
              </button>
            </div>

            {/* Result feedback */}
            {findStatus === 'not-found' && (
              <div style={{ marginTop: '10px', fontSize: '.82rem', color: '#f87171' }}>
                No account found with that email address.
              </div>
            )}
            {findStatus === 'self' && (
              <div style={{ marginTop: '10px', fontSize: '.82rem', color: 'var(--text-muted)' }}>
                That's you!
              </div>
            )}
            {findStatus === 'already' && foundUser && (
              <div style={{ marginTop: '10px', fontSize: '.82rem', color: 'var(--text-muted)' }}>
                You're already friends with {foundUser.displayName}.
              </div>
            )}
            {findStatus === 'found' && foundUser && (
              <div style={{
                marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(74,222,128,.06)', border: '1px solid rgba(74,222,128,.2)',
              }}>
                <div className="user-avatar" style={{ backgroundColor: '#c9a84c', width: 36, height: 36, fontSize: '.9rem' }}>
                  {initials(foundUser)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{foundUser.displayName}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{foundUser.email}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleSendRequest}>
                  + Add Friend
                </button>
              </div>
            )}
          </div>

          {/* ── Friends list ── */}
          <div>
            <div className="section-title">My Friends</div>
            {loading ? (
              <div className="card">
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
              </div>
            ) : friends.length === 0 ? (
              <div className="card">
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No friends yet. Add someone by their email above!
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {friends.map(f => (
                  <div key={f.id} className="friend-card">
                    <div className="user-avatar" style={{ backgroundColor: f.friend?.avatar_color || '#c9a84c' }}>
                      {initials(f.friend)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{displayName(f.friend)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Pending requests ── */}
          {pendingRequests.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div className="section-title">Pending Requests</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {pendingRequests.map(req => (
                  <div key={req.id} className="friend-card">
                    <div className="user-avatar" style={{ backgroundColor: req.requester?.avatar_color || '#c9a84c' }}>
                      {initials(req.requester)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{displayName(req.requester)}</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => handleAcceptRequest(req.id, req.requester?.id)}>
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'collections' && (
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <label className="form-label">Select Friend</label>
            <select
              className="form-select"
              onChange={e => handleSelectFriend(e.target.value)}
              value={selectedFriend || ''}
            >
              <option value="">Choose a friend...</option>
              {friends.map(f => (
                <option key={f.id} value={f.friend.id}>{displayName(f.friend)}</option>
              ))}
            </select>
          </div>

          {selectedFriend && friendCollection.length > 0 && (
            <div>
              <div className="section-title">Their Collection</div>
              <div className="collection-grid">
                {friendCollection.map((card, i) => (
                  <div key={i} className="col-card">
                    {card.img && <img src={card.img} alt={card.name} />}
                    <div className="col-card-info">
                      <div className="col-card-name">{card.name}</div>
                    </div>
                    <span className="col-card-qty">×{card.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedFriend && friendCollection.length === 0 && (
            <div className="empty-state">
              <p>No cards in this collection</p>
            </div>
          )}
        </div>
      )}

      {tab === 'trades' && (
        <div>
          <div className="card">
            <p style={{ fontSize: '.9rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Trade matching lets you find cards you and your friends have for trade. Manage your want list in your collection view.
            </p>
          </div>

          {friends.length === 0 ? (
            <div className="card">
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Add friends to start trading!
              </div>
            </div>
          ) : (
            <p style={{ padding: '0 0 16px 0', fontSize: '.85rem', color: 'var(--text-muted)' }}>
              Trade matching algorithm coming soon! Check back when you have friends added.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
