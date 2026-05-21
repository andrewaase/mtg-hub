import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  getNotifications, markNotificationRead, deleteNotification, deleteAllNotifications,
  acceptFriendRequestByUsers, denyFriendRequestByUsers, createNotification,
} from '../lib/db'

const TYPE_ICON = {
  friend_request:  '🤝',
  friend_accepted: '✅',
  price_alert:     '🎯',
}

function formatTimestamp(ts) {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (isToday)     return `Today at ${time}`
  if (isYesterday) return `Yesterday at ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ` at ${time}`
}

export default function NotificationBell({ user, setPage }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen]       = useState(false)
  const [acting, setActing]   = useState(null) // notif id currently being acted on
  const panelRef = useRef(null)

  const unread = notifications.filter(n => !n.read).length

  const load = useCallback(async () => {
    if (!user) return
    const data = await getNotifications(user.id)
    setNotifications(data)
  }, [user])

  useEffect(() => {
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Accept friend request ─────────────────────────────────────────────────
  async function handleAccept(e, n) {
    e.stopPropagation()
    const fromUserId = n.data?.fromUserId
    const fromName   = n.data?.fromName || 'Someone'
    if (!fromUserId) return
    setActing(n.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const ok = await acceptFriendRequestByUsers(fromUserId, token)
      if (!ok) {
        // Request may no longer exist — just dismiss the notification
        await deleteNotification(n.id)
        setNotifications(prev => prev.filter(x => x.id !== n.id))
        return
      }
      // Notify the requester
      const myName = user.email?.split('@')[0] || 'Someone'
      createNotification(
        fromUserId, 'friend_accepted',
        `${myName} accepted your friend request`,
        `You and ${myName} are now friends.`,
        { fromUserId: user.id },
        token,
      )
      // Remove notification and navigate to friends so the list refreshes
      await deleteNotification(n.id)
      setNotifications(prev => prev.filter(x => x.id !== n.id))
      setOpen(false)
      setPage('friends')
    } finally {
      setActing(null)
    }
  }

  // ── Deny friend request ───────────────────────────────────────────────────
  async function handleDeny(e, n) {
    e.stopPropagation()
    const fromUserId = n.data?.fromUserId
    setActing(n.id)
    try {
      if (fromUserId) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) await denyFriendRequestByUsers(fromUserId, session.access_token)
      }
      await deleteNotification(n.id)
      setNotifications(prev => prev.filter(x => x.id !== n.id))
    } finally {
      setActing(null)
    }
  }

  // ── Dismiss single notification ───────────────────────────────────────────
  async function handleDismiss(e, n) {
    e.stopPropagation()
    await deleteNotification(n.id)
    setNotifications(prev => prev.filter(x => x.id !== n.id))
  }

  // ── Clear all ─────────────────────────────────────────────────────────────
  async function handleClearAll() {
    await deleteAllNotifications(user.id)
    setNotifications([])
  }

  // ── Click notification row ────────────────────────────────────────────────
  async function handleRowClick(n) {
    if (!n.read) {
      await markNotificationRead(n.id)
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    if (n.type === 'friend_request' || n.type === 'friend_accepted') { setOpen(false); setPage('friends') }
    if (n.type === 'price_alert') { setOpen(false); setPage('wishlist') }
  }

  if (!user) return null

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* ── Bell button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative',
          background: open ? 'rgba(201,168,76,.15)' : 'transparent',
          border: `1px solid ${open ? 'rgba(201,168,76,.35)' : 'transparent'}`,
          borderRadius: '50%', width: 36, height: 36,
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

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340, maxHeight: 480,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,.45)',
          display: 'flex', flexDirection: 'column',
          zIndex: 300, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: '.88rem' }}>
              Notifications {unread > 0 && <span style={{ color: '#ef4444', fontSize: '.75rem' }}>({unread} new)</span>}
            </span>
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                No notifications
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleRowClick(n)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '12px 14px',
                    background: n.read ? 'transparent' : 'rgba(201,168,76,.05)',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', transition: 'background .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(201,168,76,.05)'}
                >
                  {/* Icon */}
                  <span style={{ fontSize: '1.05rem', flexShrink: 0, marginTop: 2 }}>
                    {TYPE_ICON[n.type] || '🔔'}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '.82rem', fontWeight: n.read ? 400 : 600,
                      color: n.read ? 'var(--text-secondary)' : 'var(--text-primary)',
                      lineHeight: 1.4, paddingRight: 4,
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
                      {formatTimestamp(n.created_at)}
                    </div>

                    {/* Accept / Deny for friend requests */}
                    {n.type === 'friend_request' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleAccept(e, n)}
                          disabled={acting === n.id}
                          style={{
                            padding: '5px 14px', borderRadius: 8,
                            background: 'rgba(74,222,128,.15)',
                            border: '1px solid rgba(74,222,128,.3)',
                            color: '#4ade80', fontWeight: 700, fontSize: '.75rem',
                            cursor: acting === n.id ? 'wait' : 'pointer',
                            opacity: acting === n.id ? 0.6 : 1,
                          }}
                        >
                          {acting === n.id ? '…' : '✓ Accept'}
                        </button>
                        <button
                          onClick={e => handleDeny(e, n)}
                          disabled={acting === n.id}
                          style={{
                            padding: '5px 14px', borderRadius: 8,
                            background: 'rgba(239,68,68,.1)',
                            border: '1px solid rgba(239,68,68,.25)',
                            color: '#f87171', fontWeight: 700, fontSize: '.75rem',
                            cursor: acting === n.id ? 'wait' : 'pointer',
                            opacity: acting === n.id ? 0.6 : 1,
                          }}
                        >
                          ✕ Deny
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right side: unread dot + X */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {!n.read && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-gold)', marginTop: 4 }} />
                    )}
                    <button
                      onClick={e => handleDismiss(e, n)}
                      title="Dismiss"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '.75rem', lineHeight: 1,
                        padding: '2px 4px', borderRadius: 4,
                        opacity: 0.5,
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
