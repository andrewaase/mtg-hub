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

const rowStyle = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
}

export default function AuthModal({ onClose, showToast, user, prompt, defaultTab, setPage }) {
  const [tab, setTab] = useState(defaultTab || 'signin')

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
    if (!tosAgreed) { setError('You must agree to the Terms of Service to create an account.'); return }
    if (!fullName.trim()) { setError('Full name is required.'); return }
    if (!address1.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      setError('Please complete your shipping address.'); return
    }
    setLoading(true)
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({ email, password })
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
      <div className="modal-box" style={{ maxWidth: '440px' }}>
        {prompt && (
          <div style={{
            background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)',
            borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '1.6rem', marginBottom: '6px' }}>{prompt.icon}</div>
            <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--accent-gold)', marginBottom: '4px' }}>{prompt.title}</div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{prompt.body}</div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, fontSize: '1.2rem', color: 'var(--accent-gold)', letterSpacing: '1px' }}>
            VAULTED SINGLES
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {tab === 'signin' ? 'Sign in to sync your collection across devices' : 'Create your account'}
          </div>
        </div>

        <div className="tabs" style={{ marginBottom: '20px' }}>
          <button className={`tab ${tab === 'signin' ? 'active' : ''}`} onClick={() => { setTab('signin'); setError('') }}>
            Sign In
          </button>
          <button className={`tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => { setTab('signup'); setError('') }}>
            Create Account
          </button>
        </div>

        <form onSubmit={tab === 'signin' ? handleSignIn : handleSignUp}>

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
          <div style={{ marginBottom: 14 }}>
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
              {loading ? 'Loading…' : (tab === 'signin' ? 'Sign In' : 'Create Account')}
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
      </div>
    </div>
  )
}
