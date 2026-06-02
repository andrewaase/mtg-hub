import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, hasSupabase } from './lib/supabase'
import { getMatches, getCollection, addCard, addMatch, getWishlist } from './lib/db'
import { takeSnapshot } from './lib/priceHistory'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MobileNav from './components/MobileNav'
import Toast from './components/Toast'
import AuthModal from './components/auth/AuthModal'
import LogMatchModal from './modals/LogMatchModal'
import AddCardModal from './modals/AddCardModal'
import DecklistModal from './modals/DecklistModal'
import CameraModal from './modals/CameraModal'
import Dashboard from './pages/Dashboard'
import MatchLog from './pages/MatchLog'
import Stats from './pages/Stats'
import News from './pages/News'
import CardLookup from './pages/CardLookup'
import Collection from './pages/Collection'
import SetReleases from './pages/SetReleases'
import AdminPanel from './pages/AdminPanel'
import Friends from './pages/Friends'
import Decks from './pages/Decks'
import Wishlist from './pages/Wishlist'
import Store from './pages/Store'
import About from './pages/About'
import Membership from './pages/Membership'
import Lab from './pages/Lab'
import HeroLanding from './pages/HeroLanding'
import Terms from './pages/Terms'
import OnboardingTutorial from './components/OnboardingTutorial'
import { CollectionSkeleton, DecksSkeleton, PageSkeleton } from './components/Skeleton'
import { useMembership } from './hooks/useMembership'

// 'lab' is intentionally hidden from Sidebar/MobileNav — reachable only at /#lab
const VALID_PAGES = ['dashboard', 'log', 'stats', 'news', 'cards', 'collection', 'releases', 'friends', 'decks', 'wishlist', 'store', 'membership', 'about', 'admin', 'lab', 'terms']

const PAGE_TITLES = {
  dashboard:  'Mana Mint | MTG Card Collection Tracker',
  log:        'Match Log | Mana Mint',
  stats:      'Stats | Mana Mint',
  news:       'MTG News | Mana Mint',
  cards:      'Card Lookup | Mana Mint',
  collection: 'My Collection | Mana Mint',
  releases:   'Set Releases | Mana Mint',
  friends:    'Friends & Trades | Mana Mint',
  decks:      'My Decks | Mana Mint',
  wishlist:   'Wishlist | Mana Mint',
  store:      'Buy MTG Singles | Mana Mint Card Shop',
  membership: 'MM Pro | Mana Mint',
  about:      'About | Mana Mint',
  admin:      'Control Center | Mana Mint',
  lab:        'Hero Lab (sandbox) | Mana Mint',
  terms:      'Terms of Service & Privacy Policy | Mana Mint',
}

const PAGE_DESCRIPTIONS = {
  dashboard:  'Track your Magic: The Gathering collection value, scan cards, and monitor format staples.',
  store:      'Buy Magic: The Gathering singles at fair, daily-updated prices. Near Mint and graded MTG cards ready to ship.',
  collection: 'Manage your MTG collection, track card values, and scan new cards with your phone camera.',
  cards:      'Look up any Magic: The Gathering card — prices, rulings, set info, and format legality.',
  decks:      'Build and manage your MTG decks with format-staple suggestions and card lookups.',
  wishlist:   'Track cards you want and set price alerts for your MTG wishlist.',
  membership: 'Upgrade to Mana Mint Pro for unlimited card scans, unlimited decks, and the hand simulator.',
  about:      'Learn about Mana Mint — an MTG singles store and collection tracker built by a Magic player, for Magic players.',
  log:        'Log your Magic: The Gathering matches and track your win rates by deck and format.',
  stats:      'Detailed stats and charts for your Magic: The Gathering match history.',
}

function getInitialPage() {
  const hash = window.location.hash.replace('#', '')
  // Supabase auth callbacks arrive as ?error=... or #access_token=... — treat as dashboard
  if (hash.startsWith('access_token=') || hash.startsWith('error=')) return 'dashboard'
  return VALID_PAGES.includes(hash) ? hash : 'dashboard'
}

export default function App() {
  const [page, setPageState] = useState(getInitialPage)
  const [user, setUser] = useState(null)
  const [matches, setMatches] = useState([])
  const [collection, setCollection] = useState([])
  const [wishlist, setWishlist] = useState([])
  const [toast, setToast] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showLogMatch, setShowLogMatch] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [decklistDeck, setDecklistDeck] = useState(null)
  const [prefillCard, setPrefillCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authPrompt, setAuthPrompt] = useState(null)
  // Membership status
  const membership = useMembership(user)
  // Onboarding tutorial — shown once after first sign-up
  const [showOnboarding, setShowOnboarding] = useState(false)
  // Hero landing — splash shown once per browser session in the content area
  const [showHeroLanding, setShowHeroLanding] = useState(
    () => !sessionStorage.getItem('vaulted:hero-seen')
  )
  // Ref so setPage (used by Sidebar) can dismiss the hero without stale closures
  const heroLandingActiveRef = useRef(!sessionStorage.getItem('vaulted:hero-seen'))

  // Lazy-mount pages: track which pages have been visited so they stay mounted
  // (hidden with display:none) without crashing pages that haven't been opened yet
  const [mountedPages, setMountedPages] = useState(() => new Set([getInitialPage()]))

  useEffect(() => {
    setMountedPages(prev => {
      if (prev.has(page)) return prev
      const next = new Set(prev)
      next.add(page)
      return next
    })
  }, [page])

  // Deck modal nav-block: prevents accidental navigation while deck editor is open
  const deckModalOpenRef = useRef(false)
  const setDeckModalOpen = useCallback((v) => { deckModalOpenRef.current = v }, [])
  // Track whether initial data load has completed so token-refresh re-runs of load()
  // don't flip loading back to true and unmount every page (resetting their state)
  const initialLoadDoneRef = useRef(false)
  // Card lookup pre-search: set by clicking a card name in the deck builder
  const [cardSearch, setCardSearch] = useState('')
  // Store pre-search: set by clicking "Buy from Vaulted Singles" in Card Lookup
  const [storeSearch, setStoreSearch] = useState('')

  const setPage = useCallback((newPage) => {
    // Silently block navigation while the deck import/edit modal is open
    if (deckModalOpenRef.current) return
    // Dismiss the hero landing whenever the user navigates anywhere
    if (heroLandingActiveRef.current) {
      sessionStorage.setItem('vaulted:hero-seen', '1')
      setShowHeroLanding(false)
      heroLandingActiveRef.current = false
    }
    setPageState(newPage)
    window.history.pushState({ page: newPage }, '', `#${newPage}`)
    document.title = PAGE_TITLES[newPage] || 'Mana Mint'
    // Update meta description for social sharing
    const desc = PAGE_DESCRIPTIONS[newPage]
    if (desc) {
      document.querySelector('meta[name="description"]')?.setAttribute('content', desc)
      document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc)
      document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', desc)
    }
    const title = PAGE_TITLES[newPage]
    if (title) {
      document.querySelector('meta[property="og:title"]')?.setAttribute('content', title)
      document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title)
    }
  }, [])

  // Dismiss hero landing and navigate to the chosen page (buttons + ✕)
  const handleHeroNavigate = useCallback((dest) => {
    heroLandingActiveRef.current = false
    sessionStorage.setItem('vaulted:hero-seen', '1')
    setShowHeroLanding(false)
    if (dest) setPage(dest)
  }, [setPage])

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e) {
      // '/' key — focus the search input on any page that has one
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        const input = document.querySelector('input[type="search"], input[placeholder*="earch"], input[placeholder*="earch"]')
          || document.querySelector('input[type="text"]')
        input?.focus()
        return
      }
      // 'Escape' key — close open modals
      if (e.key === 'Escape') {
        if (showAuth)     { setShowAuth(false);     setAuthPrompt(null) }
        if (showLogMatch) { setShowLogMatch(false) }
        if (showAddCard)  { setShowAddCard(false) }
        if (showCamera)   { setShowCamera(false) }
        if (sidebarOpen)  { setSidebarOpen(false) }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAuth, showLogMatch, showAddCard, showCamera, sidebarOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mobile swipe-right to go back ─────────────────────────────────────────
  useEffect(() => {
    let touchStartX = 0
    let touchStartY = 0

    function onTouchStart(e) {
      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
    }

    function onTouchEnd(e) {
      const dx = e.changedTouches[0].clientX - touchStartX
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY)
      // Only fire on a left-edge swipe (start ≤ 32px) that is clearly horizontal
      if (touchStartX <= 32 && dx > 60 && dy < 60) {
        window.history.back()
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend',   onTouchEnd)
    }
  }, [])

  // Browser back/forward
  useEffect(() => {
    window.history.replaceState({ page: getInitialPage() }, '', `#${getInitialPage()}`)
    const handlePopState = (e) => {
      const target = e.state?.page || getInitialPage()
      setPageState(target)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])




  const showToast = useCallback((msg, duration = 3000) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }, [])

  // Auth listener + email-confirmation callback handler
  useEffect(() => {
    if (!hasSupabase) { setLoading(false); return }

    // Handle Supabase redirect after email confirmation.
    // The URL hash contains either access_token=... (success) or error=... (failure).
    const rawHash = window.location.hash.slice(1)
    if (rawHash.startsWith('access_token=') || rawHash.startsWith('error=')) {
      const params = new URLSearchParams(rawHash)
      if (params.get('error')) {
        const desc = params.get('error_description')?.replace(/\+/g, ' ') || 'Email confirmation failed.'
        // Show error once auth state settles
        setTimeout(() => showToast(`Email confirmation error: ${desc}`, 5000), 800)
      }
      // Strip the auth tokens from the URL bar so they don't persist on refresh
      window.history.replaceState({}, '', window.location.pathname)
    }

    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' && rawHash.startsWith('access_token=')) {
        // User just confirmed their email and got signed in automatically
        setTimeout(() => showToast('Email confirmed — welcome to Mana Mint!', 4000), 400)
      }
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show onboarding tutorial once per new user (after sign-up / first sign-in)
  useEffect(() => {
    if (!user) return
    const key = `vs-onboarding-done-${user.id}`
    if (!localStorage.getItem(key)) {
      // Small delay so the app has time to load before showing the tutorial
      const t = setTimeout(() => setShowOnboarding(true), 1500)
      return () => clearTimeout(t)
    }
  }, [user])

  // Server-side admin verification — runs whenever the logged-in user changes
  useEffect(() => {
    if (!user || !hasSupabase) { setIsAdmin(false); return }
    let cancelled = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled || !session?.access_token) { setIsAdmin(false); return }
      try {
        const res = await fetch('/.netlify/functions/is-admin', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        const { isAdmin: result } = await res.json()
        if (!cancelled) setIsAdmin(!!result)
      } catch {
        if (!cancelled) setIsAdmin(false)
      }
    })
    return () => { cancelled = true }
  }, [user])

  // Load data, then take price snapshot + check wishlist alerts
  useEffect(() => {
    // forSale / forTrade live in localStorage (not Supabase) — reapply them every time
    // the collection is loaded fresh so they survive page refreshes.
    function withBinders(cards) {
      try {
        const binders = JSON.parse(localStorage.getItem('mtg-hub-binders') || '{}')
        if (Object.keys(binders).length === 0) return cards
        return cards.map(card => {
          const b = binders[String(card.id)]
          return b ? { ...card, forSale: b.forSale ?? false, forTrade: b.forTrade ?? false } : card
        })
      } catch { return cards }
    }

    async function load() {
      // Only show the loading skeleton on the very first data load.
      // Subsequent calls (Supabase TOKEN_REFRESHED, sign-in/out) silently
      // refresh data in the background without unmounting pages.
      if (!initialLoadDoneRef.current) setLoading(true)
      const [m, c, w] = await Promise.all([getMatches(user?.id), getCollection(user?.id), getWishlist(user?.id)])

      // Auto-migrate localStorage data → Supabase on first sign-in
      if (user && hasSupabase) {
        const migrationKey = `vs-migrated-${user.id}`
        if (!localStorage.getItem(migrationKey)) {
          try {
            const lsData = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
            const lsCards = lsData.collection || []
            const lsMatches = lsData.matches || []
            if (c.length === 0 && lsCards.length > 0) {
              await Promise.all(lsCards.map(card => addCard(card, user.id)))
              const migrated = await getCollection(user.id)
              setCollection(withBinders(migrated))
              setMatches(m.length === 0 && lsMatches.length > 0
                ? await Promise.all(lsMatches.map(match => addMatch(match, user.id))).then(() => getMatches(user.id))
                : m
              )
              localStorage.setItem(migrationKey, '1')
              setLoading(false)
              initialLoadDoneRef.current = true
              showToast(`✅ Synced ${lsCards.length} cards to your account`)
              return
            } else {
              localStorage.setItem(migrationKey, '1')
            }
          } catch { /* ignore migration errors */ }
        }
      }

      setMatches(m)
      setCollection(withBinders(c))
      setWishlist(w || [])
      setLoading(false)
      initialLoadDoneRef.current = true

      // Daily portfolio snapshot (no-op if already taken today)
      if (c.length > 0) takeSnapshot(c)

      // Wishlist price alert check — toast + DB notification (deduped per card per day)
      try {
        const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
        const wl = stored.wishlist || []
        const alerts = wl.filter(i =>
          i.targetPrice != null && i.currentPrice != null && i.currentPrice <= i.targetPrice
        )
        if (alerts.length > 0) {
          setTimeout(() => showToast(
            `🎯 ${alerts.length} wishlist card${alerts.length > 1 ? 's' : ''} at or below target price!`,
            5000
          ), 1500)
          // Create DB notifications for new alerts (skip if already notified today)
          if (user && hasSupabase) {
            const today = new Date().toISOString().slice(0, 10)
            const notifiedKey = `vs-price-alerted-${today}`
            const already = JSON.parse(localStorage.getItem(notifiedKey) || '[]')
            const { data: { session } } = await supabase.auth.getSession()
            const { createNotification } = await import('./lib/db')
            for (const item of alerts) {
              if (already.includes(item.name)) continue
              await createNotification(
                user.id, 'price_alert',
                `💰 ${item.name} hit your target price`,
                `Now $${Number(item.currentPrice).toFixed(2)} — your target was $${Number(item.targetPrice).toFixed(2)}.`,
                { cardName: item.name, currentPrice: item.currentPrice, targetPrice: item.targetPrice },
                session?.access_token,
              )
              already.push(item.name)
            }
            localStorage.setItem(notifiedKey, JSON.stringify(already))
          }
        }
      } catch { /* ignore */ }
    }
    load()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const openCardSearch = useCallback((cardName) => {
    setCardSearch(cardName)
    setPageState('cards')
    window.history.pushState({ page: 'cards' }, '', '#cards')
    document.title = PAGE_TITLES['cards']
  }, [])

  const openStoreSearch = useCallback((cardName) => {
    setStoreSearch(cardName)
    setPageState('store')
    window.history.pushState({ page: 'store' }, '', '#store')
    document.title = PAGE_TITLES['store']
  }, [])

  const pageProps = {
    user, isAdmin, matches, setMatches, collection, setCollection, wishlist, setWishlist, showToast, setPage,
    membership,
    openLogMatch: () => setShowLogMatch(true),
    openAddCard: (prefill) => { setPrefillCard(prefill || null); setShowAddCard(true) },
    openCamera: () => {
      if (!user) {
        setAuthPrompt({ icon: '📷', title: 'Scan cards with your camera', body: 'Create a free account to scan cards and add them to your collection instantly.' })
        setShowAuth(true)
        return
      }
      if (membership.loaded && !membership.canScan) {
        setAuthPrompt(null)
        // UpgradeModal is shown from CameraModal — pass the info via showToast for now;
        // the modal itself will gate on membership.canScan
      }
      setShowCamera(true)
    },
    onStartTutorial: () => {
      if (user) localStorage.removeItem(`vs-onboarding-done-${user.id}`)
      setShowOnboarding(true)
    },
    openDecklist: (deck) => setDecklistDeck(deck),
    setDeckModalOpen,
    openCardSearch,
    openStoreSearch,
  }

  return (
    <div id="app">
      <Sidebar page={page} setPage={setPage} user={user} isAdmin={isAdmin} onAuthClick={() => setShowAuth(true)} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div id="overlay" className={sidebarOpen ? 'open' : ''} onClick={() => setSidebarOpen(false)} />
      <div id="main">
        <TopBar page={page} user={user} setPage={setPage} onLogMatch={() => setShowLogMatch(true)} onAuthClick={() => setShowAuth(true)} onMenuClick={() => setSidebarOpen(!sidebarOpen)} onLogoClick={() => setPage('dashboard')} />
        <div id="content">
          {loading ? (
            /* Show a contextual skeleton while data loads */
            page === 'collection' ? <CollectionSkeleton /> :
            page === 'decks'      ? <DecksSkeleton />      :
            <PageSkeleton />
          ) : showHeroLanding ? (
            <HeroLanding
              user={user}
              onNavigate={handleHeroNavigate}
              onAuthClick={() => {
                heroLandingActiveRef.current = false
                sessionStorage.setItem('vaulted:hero-seen', '1')
                setShowHeroLanding(false)
                setAuthPrompt(null)
                setShowAuth(true)
              }}
            />
          ) : (
            /* Pages are lazily mounted on first visit, then kept mounted (hidden with
               display:none) so scroll position, search state, and open card details
               are all preserved when switching tabs — no state reset on navigation. */
            <>
              {mountedPages.has('dashboard')  && <div style={{ display: page === 'dashboard'  ? undefined : 'none' }}><Dashboard {...pageProps} /></div>}
              {mountedPages.has('log')        && <div style={{ display: page === 'log'        ? undefined : 'none' }}><MatchLog {...pageProps} /></div>}
              {mountedPages.has('stats')      && <div style={{ display: page === 'stats'      ? undefined : 'none' }}><Stats {...pageProps} /></div>}
              {mountedPages.has('news')       && <div style={{ display: page === 'news'       ? undefined : 'none' }}><News {...pageProps} /></div>}
              {mountedPages.has('cards')      && <div style={{ display: page === 'cards'      ? undefined : 'none' }}><CardLookup {...pageProps} initialSearch={cardSearch} onSearchUsed={() => setCardSearch('')} /></div>}
              {mountedPages.has('collection') && <div style={{ display: page === 'collection' ? undefined : 'none' }}><Collection {...pageProps} /></div>}
              {mountedPages.has('releases')   && <div style={{ display: page === 'releases'   ? undefined : 'none' }}><SetReleases /></div>}
              {mountedPages.has('friends')    && <div style={{ display: page === 'friends'    ? undefined : 'none' }}><Friends {...pageProps} isActive={page === 'friends'} /></div>}
              {mountedPages.has('decks')      && <div style={{ display: page === 'decks'      ? undefined : 'none' }}><Decks {...pageProps} /></div>}
              {mountedPages.has('wishlist')   && <div style={{ display: page === 'wishlist'   ? undefined : 'none' }}><Wishlist {...pageProps} /></div>}
              {mountedPages.has('store')      && <div style={{ display: page === 'store'      ? undefined : 'none' }}><Store initialSearch={storeSearch} onSearchUsed={() => setStoreSearch('')} user={user} isActive={page === 'store'} /></div>}
              {mountedPages.has('membership') && <div style={{ display: page === 'membership' ? undefined : 'none' }}><Membership user={user} showToast={showToast} membership={membership} onMembershipChange={membership.refresh} /></div>}
              {mountedPages.has('about')      && <div style={{ display: page === 'about'      ? undefined : 'none' }}><About setPage={setPage} /></div>}
              {mountedPages.has('admin')      && <div style={{ display: page === 'admin'      ? undefined : 'none' }}><AdminPanel user={user} isAdmin={isAdmin} /></div>}
              {mountedPages.has('lab')        && <div style={{ display: page === 'lab'        ? undefined : 'none' }}><Lab setPage={setPage} /></div>}
              {mountedPages.has('terms')      && <div style={{ display: page === 'terms'      ? undefined : 'none' }}><Terms setPage={setPage} /></div>}
            </>
          )}
        </div>
      </div>
      <MobileNav page={page} setPage={setPage} openLogMatch={() => setShowLogMatch(true)} openCamera={pageProps.openCamera} openAddCard={(prefill) => { setPrefillCard(prefill || null); setShowAddCard(true) }} />

      {showAuth    && <AuthModal onClose={() => { setShowAuth(false); setAuthPrompt(null) }} showToast={showToast} user={user} prompt={authPrompt} defaultTab={authPrompt ? 'signup' : 'signin'} setPage={setPage} />}
      {showLogMatch && <LogMatchModal onClose={() => setShowLogMatch(false)} {...pageProps} />}
      {showAddCard  && <AddCardModal onClose={() => setShowAddCard(false)} prefill={prefillCard} {...pageProps} />}
      {showCamera   && <CameraModal onClose={() => setShowCamera(false)} {...pageProps} />}
      {decklistDeck && <DecklistModal deck={decklistDeck} onClose={() => setDecklistDeck(null)} setPage={setPage} />}
      {toast && <Toast msg={toast} />}
      {showOnboarding && (
        <OnboardingTutorial
          setPage={setPage}
          onDone={() => {
            setShowOnboarding(false)
            if (user) localStorage.setItem(`vs-onboarding-done-${user.id}`, '1')
          }}
        />
      )}
    </div>
  )
}
