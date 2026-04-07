import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AuthModal({ onClose, showToast, user }) {
  const [tab, setTab] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    showToast('Signed out successfully')
    setLoading(false)
    onClose()
  }

  const handleSignIn = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      showToast('Signed in successfully!')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      showToast('Check your email to confirm your account!')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Signed-in view ──────────────────────────────────────
  if (user) {
    const username = user.email?.split('@')[0]
    return (
      <div className="auth-modal open">
        <div className="modal-box" style={{ maxWidth: '340px' }}>
          <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: 'var(--accent-gold)', color: '#1a1000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.6rem', fontWeight: 800, margin: '0 auto 14px',
            }}>
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '4px' }}>{username}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{user.email}</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              marginTop: '10px', padding: '4px 12px', borderRadius: '99px',
              background: 'rgba(74,222,128,.12)', border: '1px solid rgba(74,222,128,.3)',
              fontSize: '.7rem', color: '#4ade80', fontWeight: 600,
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              Signed in
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: 'rgba(201,64,64,.15)', color: '#f87171', border: '1px solid rgba(201,64,64,.3)' }}
              onClick={handleSignOut}
              disabled={loading}
            >
              {loading ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Sign-in / Sign-up view ──────────────────────────────
  return (
    <div className="auth-modal open">
      <div className="modal-box" style={{ maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent-gold)', letterSpacing: '1px' }}>
            VAULTED SINGLES
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Sign in to sync your collection across devices</div>
        </div>

        <div className="tabs" style={{ marginBottom: '20px' }}>
          <button className={`tab ${tab === 'signin' ? 'active' : ''}`} onClick={() => setTab('signin')}>
            Sign In
          </button>
          <button className={`tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>
            Create Account
          </button>
        </div>

        <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: '.85rem', marginBottom: '16px', padding: '8px', background: 'rgba(201,64,64,.1)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Loading...' : (tab === 'signin' ? 'Sign In' : 'Sign Up')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
