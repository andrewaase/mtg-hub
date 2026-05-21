import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getNotifications, markNotificationRead, markAllNotificationsRead, acceptFriendRequest, createNotification } from '../lib/db'

const TYPE_ICON = {
  friend_request:  '🤝',
  friend_accepted: '✅',
  price_alert:     '🎯',
}

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationBell({ user, setPage }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen]       = useState(false)
  const [accepting, setAccepting] = useState(null) // notif id being accepted
  const panelRef = useRef(null)

  const unread = notifications.filter(n => !n.read).length

  const load = useCallback(async () => {
    if (!user) return
    const data = await getNotifications(user.id)
    setNotifications(data)
  }, [user])

  // Initial load + poll every 30 s
  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleAccept(e, n) {
    e.stopPropagation()
    const requestId = n.data?.requestId
    const fromUserId = n.data?.fromUserId
    const fromName = n.data?.fromName || 'Someone'
    if (!requestId) {
      // No requestId stored — fall back to navigating to friends page
      setOpen(false)
      setPage('friends')
      return
    }
    setAccepting(n.id)
    try {
      await acceptFriendRequest(requestId)
      // Mark notification as read and remove the accept button by updating type
      await markNotificationRead(n.id)
      setNotifications(prev => prev.map(x =>
        x.id === n.id ? { ...x, read: true, type: 'friend_accepted', title: `You and ${fromName} are now friends!`, body: null } : x
      ))
      // Notify the requester their request was accepted
      const myName = user.email?.split('@')[0] || 'Someone'
      const { data: { session } } = await supabase.auth.getSession()
      if (fromUserId && session?.access_token) {
        createNotification(
          fromUserId, 'friend_accepted',
          `${myName} accepted your friend request`,
          `You and ${myName} are now friends.`,
          { fromUserId: user.id },
          session.access_token,
        )
      }
    } finally {
      setAccepting(null)
    }
  }

  async function handleClick(n) {
    if (!n.read) {
      await markNotificationRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    setOpen(false)
    if (n.type === 'friend_request' || n.type === 'friend_accepted') setPage('friends')
    if (n.type === 'price_alert') setPage('wishlist')
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead(user.id)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  if (!user) return null

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative',
          background: open ? 'rgba(201,168,76,.15)' : 'transparent',
          border: `1px solid ${open ? 'rgba(201,168,76,.35)' : 'transparent'}`,
          borderRadius: '50%',
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '1rem',
          color: open ? 'var(--accent-gold)' : 'var(--text-muted)',
          transition: 'all .15s',
        }}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: '99px',
            background: '#ef4444', color: '#fff',
            fontSize: '.6rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
            border: '1.5px solid var(--bg-primary)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, maxHeight: 440,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column',
          zIndex: 300, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: '.88rem' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.72rem', color: 'var(--accent-gold)', fontWeight: 600 }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px',
                    background: n.read ? 'transparent' : 'rgba(201,168,76,.05)',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(201,168,76,.05)'}
                >
                  <span style={{ fontSize: '1.1rem', flexShrink: 0, marginTop: 1 }}>
                    {TYPE_ICON[n.type] || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '.82rem', fontWeight: n.read ? 400 : 600,
                      color: n.read ? 'var(--text-secondary)' : 'var(--text-primary)',
                      lineHeight: 1.4,
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                    {/* Accept button for pending friend requests */}
                    {n.type === 'friend_request' && (
                      <button
                        onClick={e => handleAccept(e, n)}
                        disabled={accepting === n.id}
                        style={{
                          marginTop: 8,
                          padding: '5px 14px', borderRadius: 8,
                          background: 'rgba(201,168,76,.15)',
                          border: '1px solid rgba(201,168,76,.35)',
                          color: 'var(--accent-gold)', fontWeight: 700,
                          fontSize: '.75rem', cursor: accepting === n.id ? 'wait' : 'pointer',
                          opacity: accepting === n.id ? 0.6 : 1,
                        }}
                      >
                        {accepting === n.id ? 'Accepting…' : '✓ Accept'}
                      </button>
                    )}
                  </div>
                  {!n.read && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: 'var(--accent-gold)', flexShrink: 0, marginTop: 5,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
