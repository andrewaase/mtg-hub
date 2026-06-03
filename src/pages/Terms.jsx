// Terms of Service & Privacy Policy — Mana Mint
// Last updated: 2025

export default function Terms({ setPage }) {
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
          &larr; Back to Dashboard
        </button>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-.01em' }}>
          Terms of Service &amp; Privacy Policy
        </h1>
        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: 0 }}>
          Last updated: June 2025 &nbsp;&middot;&nbsp; Effective immediately upon account creation.
        </p>
      </div>

      <div style={{
        marginTop: 28, padding: '16px 20px',
        background: 'rgba(30,196,166,.06)', border: '1px solid rgba(30,196,166,.2)',
        borderRadius: 10, fontSize: '.82rem', color: 'var(--text-muted)', lineHeight: 1.65,
      }}>
        By creating an account or using Mana Mint (&ldquo;the Service&rdquo;), you agree to these Terms
        of Service and Privacy Policy in full. If you do not agree, do not use the Service.
      </div>

      {/* 1 */}
      {section('1. Who We Are')}
      {p('Mana Mint is an online retail and collection-management service specializing in Magic: The Gathering single cards and sealed product. We operate at manamint.store and related subdomains. References to "we," "us," or "our" mean Mana Mint.')}

      {/* 2 */}
      {section('2. Eligibility')}
      {p('You must be at least 13 years old to create an account. If you are under 18, you confirm that a parent or legal guardian has reviewed and agreed to these Terms on your behalf. By using the Service you represent that you meet these requirements.')}

      {/* 3 */}
      {section('3. Accounts & Registration')}
      {p('When you register you must provide accurate, current, and complete information — including your legal name, email address, and shipping address. You are responsible for maintaining the confidentiality of your password and for all activity under your account. Notify us immediately at manamintmtg@gmail.com if you suspect unauthorized access.')}
      {p('We may suspend or terminate accounts that violate these Terms, provide false information, or engage in fraudulent or abusive behavior.')}

      {/* 4 */}
      {section('4. Orders, Pricing & Payments')}
      {p('All prices are listed in US dollars and are subject to change without notice. We reserve the right to cancel or refuse any order at our discretion, including in the event of pricing errors or suspected fraud. Payment is due at the time of purchase. We accept major credit/debit cards and any other payment methods listed at checkout.')}
      {p('Sales tax may be applied where required by law. You are responsible for any applicable import duties or taxes if ordering from outside the United States.')}

      {/* 5 */}
      {section('5. Shipping & Returns')}
      {p('We ship to addresses in the United States. International shipping availability is noted at checkout. Orders are processed within 1–3 business days. Tracking information is emailed once your order ships. We are not responsible for carrier delays or losses once a package has been accepted by the carrier.')}
      {p('Due to the collectible nature of our products, all sales are generally final. If you receive a damaged or incorrect item, contact us within 7 days of delivery at manamintmtg@gmail.com and we will work to make it right.')}

      {/* 6 */}
      {section('6. Intellectual Property')}
      {p('The Mana Mint name, logo, website design, and original written content are our intellectual property. Magic: The Gathering card names, artwork, and related materials are the property of Wizards of the Coast LLC. Card images displayed through the Service are sourced from Scryfall (scryfall.com) under their non-commercial image use policy. We claim no ownership over third-party card imagery.')}

      {/* 7 */}
      {section('7. Prohibited Conduct')}
      {p('You agree not to: (a) use the Service for any unlawful purpose; (b) scrape, crawl, or systematically download content; (c) attempt to gain unauthorized access to our systems; (d) post or transmit spam, malware, or harmful code; (e) impersonate another person or entity; or (f) engage in any conduct that disrupts other users\' experience.')}

      {/* 8 — PRIVACY */}
      {section('8. Privacy Policy — Data We Collect')}
      {p('We collect the following categories of personal data when you register or use the Service:')}
      <ul style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.75, paddingLeft: 24, margin: '0 0 12px' }}>
        <li><strong style={{ color: 'var(--text-primary)' }}>Identity data:</strong> full name.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Contact data:</strong> email address, shipping address.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Account data:</strong> password (stored as a bcrypt hash — we never store your plain-text password), membership tier.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Collection data:</strong> cards you add to your personal collection tracker, deck lists, wishlist items, and match log entries you choose to save.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Usage data:</strong> card-scan logs (date and count, not image content), pages visited, approximate timestamps of activity.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Technical data:</strong> IP address, browser type, device type, session identifiers.</li>
      </ul>
      {p('We do not store payment card numbers. All payment processing is handled by our payment processor (Stripe) under their own PCI-DSS-compliant infrastructure.')}

      {/* 9 */}
      {section('9. How We Use Your Data')}
      {p('We use your personal data to: fulfill and ship orders; provide and maintain your account and collection tools; send transactional emails (order confirmations, shipping notifications, account alerts); respond to support inquiries; detect and prevent fraud or abuse; and comply with legal obligations.')}
      {p('We do not sell your personal data to third parties. We do not use your data for behavioral advertising.')}

      {/* 10 */}
      {section('10. Third-Party Services & Data Processors')}
      {p('We share data with the following service providers acting as data processors on our behalf:')}
      <ul style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.75, paddingLeft: 24, margin: '0 0 12px' }}>
        <li><strong style={{ color: 'var(--text-primary)' }}>Supabase:</strong> database and authentication (stores account, collection, and usage data on US-based servers).</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Stripe:</strong> payment processing (handles card numbers; we never see or store them).</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Netlify:</strong> website hosting and serverless functions.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Anthropic (Claude API):</strong> used to identify card names from camera scans. Only cropped image strips are sent — no personal data is included in API requests.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Scryfall:</strong> card price and metadata lookups (no personal data is sent).</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Google Analytics:</strong> aggregate, anonymized website analytics. You can opt out via the Google Analytics Opt-out Browser Add-on.</li>
      </ul>

      {/* 11 */}
      {section('11. Data Retention')}
      {p('We retain your account and collection data for as long as your account is active. If you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required to retain it for legal or accounting purposes (typically up to 7 years for transaction records).')}

      {/* 12 — GDPR / CCPA */}
      {section('12. Your Rights')}
      {p('Depending on your jurisdiction, you may have the following rights regarding your personal data:')}
      <ul style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.75, paddingLeft: 24, margin: '0 0 12px' }}>
        <li><strong style={{ color: 'var(--text-primary)' }}>Access:</strong> request a copy of the personal data we hold about you.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Correction:</strong> ask us to correct inaccurate data.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Deletion:</strong> request that we delete your personal data ("right to be forgotten").</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Portability:</strong> receive your collection data in a machine-readable format (JSON/CSV export available in your account settings).</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>Restriction / Objection:</strong> ask us to restrict or stop processing your data in certain circumstances.</li>
        <li><strong style={{ color: 'var(--text-primary)' }}>California residents (CCPA):</strong> you have the right to know what personal data we collect, the right to delete it, and the right to opt out of its sale (we do not sell personal data).</li>
      </ul>
      {p('To exercise any of these rights, email us at manamintmtg@gmail.com with the subject "Privacy Request." We will respond within 30 days. We may need to verify your identity before processing your request.')}

      {/* 13 */}
      {section('13. Cookies & Local Storage')}
      {p('We use browser localStorage and sessionStorage to maintain your session, remember preferences, and cache collection data locally for performance. We do not use third-party tracking cookies beyond Google Analytics (which you can opt out of). By using the Service, you consent to this use of browser storage.')}

      {/* 14 */}
      {section('14. Security')}
      {p('We implement industry-standard security measures including TLS encryption in transit, bcrypt password hashing, and row-level security policies in our database. No system is perfectly secure; in the event of a data breach we will notify affected users as required by applicable law.')}

      {/* 15 */}
      {section('15. Limitation of Liability')}
      {p('To the fullest extent permitted by law, Mana Mint shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the Service or these Terms. Our total liability for any claim related to the Service shall not exceed the amount you paid us in the 12 months preceding the claim.')}

      {/* 16 */}
      {section('16. Disclaimer of Warranties')}
      {p('The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted or error-free.')}

      {/* 17 */}
      {section('17. Governing Law & Disputes')}
      {p('These Terms are governed by the laws of the United States. Any dispute arising under these Terms shall be resolved by binding arbitration conducted in English, except that either party may seek injunctive relief in a court of competent jurisdiction to protect intellectual property rights. You waive any right to participate in a class-action lawsuit or class-wide arbitration.')}

      {/* 18 */}
      {section('18. Changes to These Terms')}
      {p('We may update these Terms at any time. If we make material changes, we will notify you by email or by displaying a prominent notice on the Service at least 14 days before the changes take effect. Your continued use of the Service after that date constitutes acceptance of the updated Terms.')}

      {/* 19 */}
      {section('19. Contact Us')}
      {p('Questions about these Terms or your data? Contact us at:')}
      <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', lineHeight: 1.75, margin: '0 0 12px' }}>
        Mana Mint<br />
        Email: <a href="mailto:manamintmtg@gmail.com" style={{ color: 'var(--accent-gold)' }}>manamintmtg@gmail.com</a>
      </p>

      <div style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid var(--border)', fontSize: '.75rem', color: 'var(--text-muted)' }}>
        These Terms were last updated June 2025. Prior versions are available upon request.
      </div>
    </div>
  )
}
