// src/pages/Privacy.jsx
// Privacy Policy — Mana Mint
// URL: https://www.manamint.store/#privacy

const CONTACT_EMAIL = 'manamintmtg@gmail.com'
const LAST_UPDATED  = 'June 2025'

export default function Privacy({ setPage }) {
  const section = (title) => (
    <h2 style={{
      fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)',
      margin: '36px 0 10px', paddingTop: 36,
      borderTop: '1px solid var(--border)',
      letterSpacing: '.01em',
    }}>{title}</h2>
  )

  const p = (text) => (
    <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.75, margin: '0 0 12px' }}>
      {text}
    </p>
  )

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => setPage?.('dashboard')}
          style={{
            background: 'none', border: 'none', color: 'var(--accent-gold)',
            fontSize: '.8rem', cursor: 'pointer', padding: 0, marginBottom: 24,
            letterSpacing: '.03em', fontWeight: 600,
          }}
        >
          ← Back to Mana Mint
        </button>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Last updated: {LAST_UPDATED}</p>
      </div>

      {p('Mana Mint ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use the Mana Mint app and website (manamint.store).')}

      {section('Information We Collect')}
      {p('Account Information: When you create an account, we collect your email address and a hashed password. You may optionally provide a display name.')}
      {p('Card Collection Data: Cards you scan or add to your collection, decks, wishlist items, and match history are stored and associated with your account.')}
      {p('Purchase Information: If you subscribe to Mana Mint Pro, your subscription status is tracked via RevenueCat (iOS) or Stripe (web). We do not store your payment card details — these are handled entirely by Apple or Stripe.')}
      {p('Usage Data: We may collect basic analytics such as app version and general feature usage to improve the app. We do not sell this data.')}
      {p('Device Information: On iOS, we access your device camera solely for card scanning. Camera access is requested at the time of use and can be revoked in device Settings at any time.')}

      {section('How We Use Your Information')}
      {p('• To provide and maintain the Mana Mint service')}
      {p('• To sync your collection, decks, and wishlist across devices')}
      {p('• To process and manage your Pro subscription')}
      {p('• To send you important service notifications (no marketing emails without consent)')}
      {p('• To improve the app based on usage patterns')}

      {section('Third-Party Services')}
      {p('Mana Mint uses the following third-party services, each with their own privacy policies:')}
      {p('• Supabase — database and authentication (supabase.com/privacy)')}
      {p('• RevenueCat — iOS in-app purchase management (revenuecat.com/privacy)')}
      {p('• Stripe — web payment processing (stripe.com/privacy)')}
      {p('• Scryfall — Magic: The Gathering card data and images (scryfall.com/privacy)')}
      {p('• Netlify — web hosting and serverless functions (netlify.com/privacy)')}
      {p('• Anthropic Claude API — used for card scanning image recognition (anthropic.com/privacy)')}
      {p('Card images scanned via the app are sent to the Anthropic Claude API for identification. Images are not stored by us after the scan is complete.')}

      {section('Data Storage and Security')}
      {p('Your data is stored securely in Supabase, which uses industry-standard encryption in transit (TLS) and at rest. We take reasonable measures to protect your information, but no method of transmission over the internet is 100% secure.')}
      {p('Your data is stored in the United States.')}

      {section('Data Retention')}
      {p('We retain your data for as long as your account is active. If you delete your account, all associated data (collection, decks, wishlist, match history, and profile) is permanently deleted within a reasonable timeframe.')}

      {section('Your Rights and Choices')}
      {p('• Access: You can view all your data within the app at any time.')}
      {p('• Correction: You can update your account information in your profile settings.')}
      {p('• Deletion: You can permanently delete your account and all associated data from the Account settings screen within the app. This action is irreversible.')}
      {p('• Camera Access: You can revoke camera permissions at any time in your device Settings.')}

      {section('Children\'s Privacy')}
      {p('Mana Mint is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us immediately.')}

      {section('Changes to This Policy')}
      {p('We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the "Last updated" date at the top of this page. Continued use of the app after changes constitutes acceptance of the updated policy.')}

      {section('Contact Us')}
      {p('If you have any questions about this Privacy Policy or how we handle your data, please contact us at:')}
      <p style={{ fontSize: '.88rem', color: 'var(--accent-gold)', lineHeight: 1.75, margin: '0 0 12px' }}>
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--accent-gold)' }}>{CONTACT_EMAIL}</a>
      </p>

    </div>
  )
}
