import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const inputStyle = {
  width: '100%', padding: '10px 12px',
  background: 'var(--bg-input, rgba(255,255,255,.06))',
  border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)',
  fontSize: '.88rem', boxSizing: 'border-box',
  outline: 'none',
}

const labelStyle = {
  display: 'block', fontSize: '.75rem', fontWeight: 600,
  color: 'var(--text-muted)', marginBottom: 5, letterSpacing: '.02em',
}

export default function ResetPasswordModal({ onClose, showToast }) {
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      showToast('Password updated — you\'re all set!')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-modal open">
      <div className="modal-box" style={{ maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img src="/Horizontal-Mana-Mint-logo-transparent.png" alt="Mana Mint" style={{ width: '160px', height: 'auto', marginBottom: '6px' }} />
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
            Choose a new password
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              style={inputStyle}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password"
              style={inputStyle}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: '.82rem', marginBottom: '14px', padding: '10px 12px', background: 'rgba(201,64,64,.1)', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
