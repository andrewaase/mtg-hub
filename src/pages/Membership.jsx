// src/pages/Membership.jsx
// Pro membership page — shows current status, pricing plans, and lets users
// subscribe, manage their billing, or redeem free months from store purchases.
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const MONTHLY_PRICE_ID = import.meta.env.VITE_STRIPE_MONTHLY_PRICE_ID || 'price_1TW5PM3vsGfrYNehY1OmZnFZ'
const ANNUAL_PRICE_ID  = import.meta.env.VITE_STRIPE_ANNUAL_PRICE_ID  || 'price_1TW5PM3vsGfrYNehCP3u9HTL'

export default function Membership({ user, showToast, membership, onMembershipChange }) {
  const [billing, setBilling] = useState('monthly') // 'monthly' | 'annual'
  const [loading, setLoading] = useState('')        // '' | 'subscribe' | 'portal' | 'redeem'

  // ── Subscribe (Stripe Checkout) ──────────────────────────────────────────────
  const handleSubscribe = async () => {
    if (!user) { showToast('Sign in first to subscribe'); return }
    setLoading('subscribe')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const priceId = billing === 'annual' ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID
      const res     = await fetch('/.netlify/functions/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body:    JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Could not create checkout session')
      }
    } catch (err) {
      showToast(`Error: ${err.message}`)
    } finally {
      setLoading('')
    }
  }

  // ── Manage billing (Stripe Customer Portal) ──────────────────────────────────
  const handleManageBilling = async () => {
    setLoading('portal')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res  = await fetch('/.netlify/functions/customer-portal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Could not open billing portal')
      }
    } catch (err) {
      showToast(`Error: ${err.message}`)
    } finally {
      setLoading('')
    }
  }

  // ── Redeem free months ────────────────────────────────────────────────────────
  const handleRedeem = async () => {
    if (!membership?.freeMonthsRemaining) return
    setLoading('redeem')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res  = await fetch('/.netlify/functions/redeem-free-months', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (data.success) {
        showToast(`✅ ${data.monthsRedeemed} free month${data.monthsRedeemed > 1 ? 's' : ''} applied to your account!`)
        onMembershipChange?.()
      } else {
        throw new Error(data.error || 'Redeem failed')
      }
    } catch (err) {
      showToast(`Error: ${err.message}`)
    } finally {
      setLoading('')
    }
  }

  const isPro      = membership?.isPro
  const scansLeft  = membership?.scansLeft ?? 100
  const scanLimit  = membership?.scanLimit ?? 100
  const scanPct    = scanLimit ? Math.max(0, Math.min(100, (scansLeft / scanLimit) * 100)) : 100
  const endDate    = membership?.membershipEnd
    ? new Date(membership.membershipEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  const annualSave = Math.round(100 - (24.99 / (2.99 * 12)) * 100)

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px' }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-gold)', marginBottom: '6px' }}>
          ⚡ Vaulted Singles Pro
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.9rem', lineHeight: 1.6 }}>
          Upgrade to unlock unlimited scans, unlimited decks, and the hand simulator.
        </p>
      </div>

      {/* ── Current status card ──────────────────────────────────────────────── */}
      {user && (
        <div style={{
          background: 'var(--card-bg)', border: `1px solid ${isPro ? 'rgba(201,168,76,.4)' : 'var(--border)'}`,
          borderRadius: '12px', padding: '20px', marginBottom: '28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              padding: '4px 12px', borderRadius: '99px', fontWeight: 700, fontSize: '.75rem',
              background: isPro ? 'rgba(201,168,76,.15)' : 'rgba(148,163,184,.1)',
              color: isPro ? 'var(--accent-gold)' : 'var(--text-muted)',
              border: `1px solid ${isPro ? 'rgba(201,168,76,.3)' : 'rgba(148,163,184,.2)'}`,
            }}>
              {isPro ? '⚡ PRO' : 'FREE'}
            </div>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>
              {isPro ? 'Pro Member' : 'Free Account'}
            </span>
            {isPro && endDate && (
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Renews {endDate}
              </span>
            )}
          </div>

          {/* Scan counter */}
          <div style={{ marginBottom: isPro ? 0 : '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <span>Daily card scans</span>
              <span style={{ fontWeight: 600, color: isPro ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                {isPro ? 'Unlimited' : `${scansLeft} / ${scanLimit} remaining`}
              </span>
            </div>
            {!isPro && (
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '99px', transition: 'width .3s',
                  width: `${scanPct}%`,
                  background: scanPct > 30 ? 'var(--accent-gold)' : '#ef4444',
                }} />
              </div>
            )}
          </div>

          {/* Redeem free months banner */}
          {membership?.freeMonthsRemaining > 0 && (
            <div style={{
              marginTop: '16px', padding: '12px 16px', borderRadius: '8px',
              background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.25)',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <span style={{ fontSize: '1.2rem' }}>🎁</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.85rem', color: '#4ade80' }}>
                  You have {membership.freeMonthsRemaining} free Pro month{membership.freeMonthsRemaining > 1 ? 's' : ''} to redeem!
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                  Earned from store purchases of $20+
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ background: '#4ade80', color: '#0d1117', fontWeight: 700, fontSize: '.8rem', padding: '6px 14px' }}
                onClick={handleRedeem}
                disabled={loading === 'redeem'}
              >
                {loading === 'redeem' ? 'Redeeming…' : 'Redeem'}
              </button>
            </div>
          )}

          {/* Manage billing */}
          {isPro && (
            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '.8rem' }}
                onClick={handleManageBilling}
                disabled={loading === 'portal'}
              >
                {loading === 'portal' ? 'Opening…' : '⚙️ Manage Billing'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Pricing plans ────────────────────────────────────────────────────── */}
      {!isPro && (
        <>
          {/* Billing toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div style={{
              display: 'inline-flex', background: 'var(--card-bg)',
              border: '1px solid var(--border)', borderRadius: '99px', padding: '4px',
            }}>
              {['monthly', 'annual'].map(b => (
                <button
                  key={b}
                  onClick={() => setBilling(b)}
                  style={{
                    padding: '6px 20px', borderRadius: '99px', fontWeight: 600, fontSize: '.85rem',
                    border: 'none', cursor: 'pointer', transition: 'all .2s',
                    background: billing === b ? 'var(--accent-gold)' : 'transparent',
                    color: billing === b ? '#1a1000' : 'var(--text-muted)',
                  }}
                >
                  {b === 'monthly' ? 'Monthly' : `Annual · Save ${annualSave}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Plan card */}
          <div style={{
            background: 'var(--card-bg)', border: '1px solid rgba(201,168,76,.35)',
            borderRadius: '16px', padding: '32px', marginBottom: '24px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: 'linear-gradient(90deg, var(--accent-gold), #f59e0b)',
            }} />

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--accent-gold)' }}>
                {billing === 'annual' ? '$24.99' : '$2.99'}
              </div>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {billing === 'annual' ? 'per year (~$2.08 / mo)' : 'per month'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
              {[
                { icon: '📷', label: 'Unlimited card scans' },
                { icon: '📚', label: 'Unlimited decks' },
                { icon: '🏷️', label: 'Sell Binder + buylist prices' },
                { icon: '🃏', label: 'Hand simulator' },
                { icon: '🎁', label: 'Free months on orders $20+' },
                { icon: '⚡', label: 'All future Pro features' },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '.85rem' }}>
                  <span>{f.icon}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{f.label}</span>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{
                width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 800,
                background: 'var(--accent-gold)', color: '#1a1000', letterSpacing: '.5px',
              }}
              onClick={handleSubscribe}
              disabled={!user || loading === 'subscribe'}
            >
              {!user
                ? 'Sign in to Subscribe'
                : loading === 'subscribe'
                ? 'Redirecting…'
                : `Get Pro — ${billing === 'annual' ? '$24.99/yr' : '$2.99/mo'}`}
            </button>

            {!user && (
              <p style={{ textAlign: 'center', fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0 }}>
                Create a free account first, then come back to subscribe.
              </p>
            )}

            <p style={{ textAlign: 'center', fontSize: '.75rem', color: 'var(--text-muted)', marginTop: '12px', marginBottom: 0 }}>
              Cancel anytime · Powered by Stripe · No hidden fees
            </p>
          </div>
        </>
      )}

      {/* ── Free tier comparison ──────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '.9rem' }}>
          Free vs Pro
        </div>
        {[
          { feature: 'Card scans',                        free: '100 / day',  pro: 'Unlimited' },
          { feature: 'Decks',                             free: '10 total',   pro: 'Unlimited' },
          { feature: 'Sell Binder (Buylist Assistant)',   free: '✗',          pro: '✓' },
          { feature: 'Hand simulator',                    free: '✗',          pro: '✓' },
          { feature: 'Collection tracker',                free: '✓',          pro: '✓' },
          { feature: 'Card Lookup',                       free: 'Unlimited',  pro: 'Unlimited' },
          { feature: 'Price history',                     free: '✓',          pro: '✓' },
          { feature: 'Camera scanning',                   free: '100 / day',  pro: 'Unlimited' },
          { feature: 'Multiple price sources',            free: '✓',          pro: '✓' },
          { feature: 'Wishlist & alerts',                 free: '✓',          pro: '✓' },
          { feature: 'Match log',                         free: '✓',          pro: '✓' },
          { feature: 'Stats & analytics',                 free: '✓',          pro: '✓' },
          { feature: 'Friends & trades',                  free: '✓',          pro: '✓' },
          { feature: 'Set releases',                      free: '✓',          pro: '✓' },
          { feature: 'MTG news feed',                     free: '✓',          pro: '✓' },
          { feature: 'Cross-device sync',                 free: '✓',          pro: '✓' },
          { feature: 'Free months on orders $20+',        free: '✗',          pro: '✓' },
          { feature: 'All future Pro features',           free: '✗',          pro: '✓' },
        ].map((row, i) => (
          <div
            key={row.feature}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
              padding: '12px 20px', fontSize: '.85rem',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{row.feature}</span>
            <span style={{ textAlign: 'center', color: row.free === '✗' ? '#ef4444' : 'var(--text-primary)' }}>{row.free}</span>
            <span style={{ textAlign: 'center', color: 'var(--accent-gold)', fontWeight: 600 }}>{row.pro}</span>
          </div>
        ))}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          padding: '8px 20px', fontSize: '.7rem', color: 'var(--text-muted)',
          background: 'rgba(255,255,255,.02)',
        }}>
          <span />
          <span style={{ textAlign: 'center' }}>Free</span>
          <span style={{ textAlign: 'center', color: 'var(--accent-gold)' }}>Pro</span>
        </div>
      </div>

      {/* ── Store promo ───────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: '20px', padding: '16px 20px', borderRadius: '12px',
        background: 'rgba(201,168,76,.06)', border: '1px solid rgba(201,168,76,.2)',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}>
        <span style={{ fontSize: '1.6rem' }}>🛒</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '3px' }}>
            Earn free Pro months from store orders
          </div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Every $20 you spend in the Vaulted Singles store earns you one free month of Pro — automatically credited to your account after purchase. They stack!
          </div>
        </div>
      </div>

    </div>
  )
}
