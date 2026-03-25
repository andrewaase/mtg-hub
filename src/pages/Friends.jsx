import { useState, useEffect } from 'react'
import { hasSupabase } from '../lib/supabase'
import { getFriends, getPendingRequests, sendFriendRequest, acceptFriendRequest, searchUsers, getFriendCollection, getWantList, addWant, removeWant } from '../lib/db'

export default function Friends({ user, showToast }) {
  const [tab, setTab] = useState('friends')
  const [friends, setFriends] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [friendCollection, setFriendCollection] = useState([])
  const [wantList, setWantList] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user && hasSupabase) {
      loadFriendsData()
    }
  }, [user, tab])

  const loadFriendsData = async () => {
    if (!user) return
    setLoading(true)
    const [f, p, w] = await Promise.all([
      getFriends(user.id),
      getPendingRequests(user.id),
      getWantList(user.id),
    ])
    setFriends(f)
    setPendingRequests(p)
    setWantList(w)
    setLoading(false)
  }

  const handleSearch = async (query) => {
    setSearchQuery(query)
    if (query.length < 2) { setSearchResults([]); return }
    const results = await searchUsers(query)
    setSearchResults(results.filter(r => r.id !== user?.id))
  }

  const handleSendRequest = async (friendId) => {
    await sendFriendRequest(user.id, friendId)
    showToast('Friend request sent!')
    setSearchQuery('')
    setSearchResults([])
  }

  const handleAcceptRequest = async (requestId) => {
    await acceptFriendRequest(requestId)
    loadFriendsData()
    showToast('Friend request accepted!')
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
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="section-title">Add Friend</div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div className="ac-dropdown">
                  {searchResults.map(user => (
                    <div key={user.id} className="ac-item">
                      <span>{user.username}</span>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSendRequest(user.id)} style={{ marginLeft: 'auto', fontSize: '.7rem', padding: '4px 8px' }}>
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="section-title">My Friends</div>
            {friends.length === 0 ? (
              <div className="card">
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No friends yet. Search and add some!
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {friends.map(f => (
                  <div key={f.id} className="friend-card">
                    <div className="user-avatar" style={{ backgroundColor: f.friend?.avatar_color || '#c9a84c' }}>
                      {f.friend?.username[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{f.friend?.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pendingRequests.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <div className="section-title">Pending Requests</div>
              <div style={{ display: 'grid', gap: '12px' }}>
                {pendingRequests.map(req => (
                  <div key={req.id} className="friend-card">
                    <div className="user-avatar" style={{ backgroundColor: req.requester?.avatar_color || '#c9a84c' }}>
                      {req.requester?.username[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{req.requester?.username}</div>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => handleAcceptRequest(req.id)}>
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
                <option key={f.id} value={f.friend.id}>{f.friend.username}</option>
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
