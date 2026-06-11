import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { clearLocalCache } from '../../lib/db'

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

const rowStyle = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
}

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
      localStorage.setItem('mm-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('mm-theme', 'light')
    }
  }
  return [dark, toggle]
}

export default function AuthModal({ onClose, showToast, user, prompt, defaultTab, setPage }) {
  const [tab, setTab] = useState(defaultTab || 'signin')
  const [dark, toggleDark] = useDarkMode()

  // Sign-in fields
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  // Sign-up extra fields
  const [fullName,  setFullName]  = useState('')
  const [address1,  setAddress1]  = useState('')
  const [city,      setCity]      = useState('')
  const [state,     setState]     = useState('')
  const [zip,       setZip]       = useState('')
  const [country,   setCountry]   = useState('US')
  const [tosAgreed, setTosAgreed] = useState(false)

  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,       setDeleting]      = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // Change-password (signed-in account settings)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwError,   setPwError]   = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    clearLocalCache()
    showToast('Signed out successfully')
    setLoading(false)
    onClose()
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/delete-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Could not delete account')
      }
      await supabase.auth.signOut()
      clearLocalCache()
      showToast('Your account and data have been deleted')
      onClose()
    } catch (err) {
      showToast(err.message || 'Could not delete account — try again')
      setDeleting(false)
      setConfirmDelete(false)
    }
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

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setResetSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    if (newPassword.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
    setPwLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      showToast('Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
      setShowChangePassword(false)
    } catch (err) {
      setPwError(err.message)
    } finally {
      setPwLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')
    if (!tosAgreed) { setError('You must agree to the Terms of Service to create an account.'); return }
    if (!fullName.trim()) { setError('Full name is required.'); return }
    if (!address1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError('Please complete your shipping address.'); return
    }
    setLoading(true)
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // After clicking the confirmation link, Supabase redirects here.
          // Must also be listed in Supabase Dashboard → Auth → URL Configuration → Redirect URLs.
          emailRedirectTo: window.location.origin,
        },
      })
      if (signUpErr) throw signUpErr

      // Persist profile data — upsert so it works whether the DB trigger
      // already created the row or not.
      if (data?.user?.id) {
        await supabase.from('profiles').upsert({
          id:            data.user.id,
          full_name:     fullName.trim(),
          address_line1: address1.trim(),
          address_city:  city.trim(),
          address_state: state.trim(),
          address_zip:   zip.trim(),
          address_country: country.trim(),
          tos_agreed_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      }

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
          {/* Dark mode toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0', borderTop: '1px solid var(--border)', marginTop: 8,
          }}>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {dark ? '🌙 Dark Mode' : '☀️ Light Mode'}
              </div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Tap to switch theme</div>
            </div>
            <button
              onClick={toggleDark}
              style={{
                width: 48, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
                background: dark ? 'var(--accent-gold)' : 'var(--border)',
                position: 'relative', transition: 'background .2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: dark ? 25 : 3,
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
                boxShadow: '0 1px 4px rgba(0,0,0,.25)',
              }} />
            </button>
          </div>

          {/* Change password */}
          <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            {!showChangePassword ? (
              <button
                type="button"
                onClick={() => { setShowChangePassword(true); setPwError('') }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--text-primary)', fontSize: '.82rem', fontWeight: 600,
                }}
              >
                Change Password
                <span style={{ color: 'var(--text-muted)' }}>›</span>
              </button>
            ) : (
              <form onSubmit={handleChangePassword}>
                <div style={{ marginBottom: 10 }}>
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
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Confirm New Password</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {pwError && (
                  <div style={{ color: 'var(--accent-red)', fontSize: '.78rem', marginBottom: '10px', padding: '8px 10px', background: 'rgba(201,64,64,.1)', borderRadius: '8px' }}>
                    {pwError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setShowChangePassword(false); setNewPassword(''); setConfirmPassword(''); setPwError('') }}
                    disabled={pwLoading}
                    style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '.8rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', fontSize: '.8rem' }}
                  >
                    {pwLoading ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            )}
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

          {/* Danger zone: permanent account deletion (App Store requirement) */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: '.72rem', padding: '4px',
                  textDecoration: 'underline',
                }}
              >
                Delete account
              </button>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '.74rem', color: '#f87171', fontWeight: 700, marginBottom: 4 }}>
                  Permanently delete your account?
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  This erases your collection, decks, wishlist, matches, and profile. This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '.8rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#c94040', color: '#fff', cursor: deleting ? 'wait' : 'pointer', fontWeight: 700, fontSize: '.8rem' }}
                  >
                    {deleting ? 'Deleting…' : 'Delete forever'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Sign-in / Sign-up view ──────────────────────────────
  return (
    <div className="auth-modal open">
      <div className="modal-box" style={{ maxWidth: '440px' }}>
        {prompt && (
          <div style={{
            background: 'rgba(30,196,166,.08)', border: '1px solid rgba(30,196,166,.25)',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>{prompt.icon}</div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--accent-gold)', marginBottom: '4px' }}>{prompt.title}</div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{prompt.body}</div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent-gold)', letterSpacing: '1px' }}>
            MANA MINT
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {tab === 'signin' ? 'Sign in to sync your collection across devices' : tab === 'forgot' ? 'Reset your password' : 'Create your account'}
          </div>
        </div>

        {tab === 'forgot' ? (
          <div style={{ marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => { setTab('signin'); setError(''); setResetSent(false) }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-gold)', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600 }}
            >
              ← Back to Sign In
            </button>
          </div>
        ) : (
          <div className="tabs" style={{ marginBottom: '20px' }}>
            <button className={`tab ${tab === 'signin' ? 'active' : ''}`} onClick={() => { setTab('signin'); setError('') }}>
              Sign In
            </button>
            <button className={`tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => { setTab('signup'); setError('') }}>
              Create Account
            </button>
          </div>
        )}

        {tab === 'forgot' && resetSent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>📧</div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: '6px' }}>Check your email</div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '20px' }}>
              We sent a password reset link to <strong>{email}</strong>. Follow the link to choose a new password.
            </div>
            <button type="button" className="btn btn-primary" onClick={() => { setTab('signin'); setResetSent(false) }}>
              Back to Sign In
            </button>
          </div>
        ) : (
        <form onSubmit={tab === 'signin' ? handleSignIn : tab === 'forgot' ? handleForgotPassword : handleSignUp}>

          {/* Sign-up only: full name */}
          {tab === 'signup' && (
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                style={inputStyle}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>
          )}

          {/* Email */}
          <div style={{ marginBottom: tab === 'forgot' ? 0 : 14 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password */}
          {tab !== 'forgot' && (
            <div style={{ marginBottom: tab === 'signup' ? 14 : 0 }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {/* Forgot password link */}
          {tab === 'signin' && (
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <button
                type="button"
                onClick={() => { setTab('forgot'); setError(''); setResetSent(false) }}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-gold)', cursor: 'pointer', fontSize: '.75rem', fontWeight: 600 }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Sign-up only: shipping address */}
          {tab === 'signup' && (
            <>
              <div style={{ marginBottom: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: '.73rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '0 0 12px' }}>
                  Shipping Address
                </p>
                <label style={labelStyle}>Street Address</label>
                <input
                  type="text"
                  style={inputStyle}
                  value={address1}
                  onChange={e => setAddress1(e.target.value)}
                  placeholder="123 Main St"
                  required
                />
              </div>

              <div style={{ ...rowStyle, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>City</label>
                  <input type="text" style={inputStyle} value={city} onChange={e => setCity(e.target.value)} placeholder="City" required />
                </div>
                <div>
                  <label style={labelStyle}>State / Province</label>
                  <input type="text" style={inputStyle} value={state} onChange={e => setState(e.target.value)} placeholder="TX" required />
                </div>
              </div>

              <div style={{ ...rowStyle, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>ZIP / Postal Code</label>
                  <input type="text" style={inputStyle} value={zip} onChange={e => setZip(e.target.value)} placeholder="78701" required />
                </div>
                <div>
                  <label style={labelStyle}>Country</label>
                  <select
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                  >
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                    <option value="GB">United Kingdom</option>
                    <option value="AU">Australia</option>
                    <option value="DE">Germany</option>
                    <option value="FR">France</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* TOS checkbox */}
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                marginBottom: 18, cursor: 'pointer',
                fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.5,
              }}>
                <input
                  type="checkbox"
                  checked={tosAgreed}
                  onChange={e => setTosAgreed(e.target.checked)}
                  style={{ marginTop: 2, accentColor: 'var(--accent-gold)', flexShrink: 0 }}
                  required
                />
                <span>
                  I have read and agree to the{' '}
                  <button
                    type="button"
                    onClick={() => { onClose(); setPage?.('terms') }}
                    style={{
                      background: 'none', border: 'none', padding: 0,
                      color: 'var(--accent-gold)', cursor: 'pointer',
                      fontSize: '.8rem', fontWeight: 600, textDecoration: 'underline',
                    }}
                  >
                    Terms of Service &amp; Privacy Policy
                  </button>
                  . I understand that my name, email address, and shipping address will be stored to fulfill orders and maintain my account.
                </span>
              </label>
            </>
          )}

          {error && (
            <div style={{ color: 'var(--accent-red)', fontSize: '.82rem', marginBottom: '14px', padding: '10px 12px', background: 'rgba(201,64,64,.1)', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Loading…' : (tab === 'signin' ? 'Sign In' : tab === 'forgot' ? 'Send Reset Link' : 'Create Account')}
            </button>
          </div>

          {tab === 'signup' && (
            <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
              We do not sell your personal data. See our{' '}
              <button
                type="button"
                onClick={() => { onClose(); setPage?.('terms') }}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-gold)', cursor: 'pointer', fontSize: '.7rem' }}
              >
                Privacy Policy
              </button>
              {' '}for full details.
            </p>
          )}
        </form>
        )}
      </div>
    </div>
  )
}
