import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, hasSupabase } from './lib/supabase'
import { getMatches, getCollection, addCard, addMatch } from './lib/db'
import { handleEbayCallback } from './lib/ebay'
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

const VALID_PAGES = ['dashboard', 'log', 'stats', 'news', 'cards', 'collection', 'releases', 'friends', 'decks', 'wishlist', 'store', 'about', 'admin']

const PAGE_TITLES = {
  dashboard:  'Vaulted Singles | MTG Card Collection Tracker',
  log:        'Match Log | Vaulted Singles',
  stats:      'Stats | Vaulted Singles',
  news:       'MTG News | Vaulted Singles',
  cards:      'Card Lookup | Vaulted Singles',
  collection: 'My Collection | Vaulted Singles',
  releases:   'Set Releases | Vaulted Singles',
  friends:    'Friends & Trades | Vaulted Singles',
  decks:      'My Decks | Vaulted Singles',
  wishlist:   'Wishlist | Vaulted Singles',
  store:      'Buy MTG Singles | Vaulted Singles Card Shop',
  about:      'About | Vaulted Singles',
  admin:      'Control Center | Vaulted Singles',
}

const PAGE_DESCRIPTIONS = {
  dashboard:  'Track your Magic: The Gathering collection value, scan cards, and monitor format staples.',
  store:      'Buy Magic: The Gathering singles at fair, daily-updated prices. Near Mint and graded MTG cards ready to ship.',
  collection: 'Manage your MTG collection, track card values, and scan new cards with your phone camera.',
  cards:      'Look up any Magic: The Gathering card — prices, rulings, set info, and format legality.',
  decks:      'Build and manage your MTG decks with format-staple suggestions and card lookups.',
  wishlist:   'Track cards you want and set price alerts for your MTG wishlist.',
  about:      'Learn about Vaulted Singles — an MTG singles store and collection tracker built by a Magic player, for Magic players.',
  log:        'Log your Magic: The Gathering matches and track your win rates by deck and format.',
  stats:      'Detailed stats and charts for your Magic: The Gathering match history.',
}

function getInitialPage() {
  const hash = window.location.hash.replace('#', '')
  return VALID_PAGES.includes(hash) ? hash : 'dashboard'
}

export default function App() {
  const [page, setPageState] = useState(getInitialPage)
  const [user, setUser] = useState(null)
  const [matches, setMatches] = useState([])
  const [collection, setCollection] = useState([])
  const [toast, setToast] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showLogMatch, setShowLogMatch] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [decklistDeck, setDecklistDeck] = useState(null)
  const [prefillCard, setPrefillCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Deck modal nav-block: prevents accidental navigation while deck editor is open
  const deckModalOpenRef = useRef(false)
  const setDeckModalOpen = useCallback((v) => { deckModalOpenRef.current = v }, [])
  // Store pre-search: set by clicking a card name in the deck builder
  const [storeSearch, setStoreSearch] = useState('')

  const setPage = useCallback((newPage) => {
    // Silently block navigation while the deck import/edit modal is open
    if (deckModalOpenRef.current) return
    setPageState(newPage)
    window.history.pushState({ page: newPage }, '', `#${newPage}`)
    document.title = PAGE_TITLES[newPage] || 'Vaulted Singles'
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

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

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

  // eBay OAuth callback
  useEffect(() => {
    const result = handleEbayCallback()
    if (result === 'connected') {
      showToast('eBay account connected! ✓')
      setPageState('collection')
    } else if (result?.startsWith('error:')) {
      const reason = result.split(':')[1]
      showToast(`eBay connection failed (${reason}). Try again.`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = useCallback((msg, duration = 3000) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }, [])

  // Auth listener
  useEffect(() => {
    if (!hasSupabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  // Load data, then take price snapshot + check wishlist alerts
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [m, c] = await Promise.all([getMatches(user?.id), getCollection(user?.id)])

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
              setCollection(migrated)
              setMatches(m.length === 0 && lsMatches.length > 0
                ? await Promise.all(lsMatches.map(match => addMatch(match, user.id))).then(() => getMatches(user.id))
                : m
              )
              localStorage.setItem(migrationKey, '1')
              setLoading(false)
              showToast(`✅ Synced ${lsCards.length} cards to your account`)
              return
            } else {
              localStorage.setItem(migrationKey, '1')
            }
          } catch { /* ignore migration errors */ }
        }
      }

      setMatches(m)
      setCollection(c)
      setLoading(false)

      // Daily portfolio snapshot (no-op if already taken today)
      if (c.length > 0) takeSnapshot(c)

      // Wishlist price alert check
      try {
        const stored = JSON.parse(localStorage.getItem('mtg-hub-v1') || '{}')
        const wishlist = stored.wishlist || []
        const alerts = wishlist.filter(i =>
          i.targetPrice != null && i.currentPrice != null && i.currentPrice <= i.targetPrice
        )
        if (alerts.length > 0) {
          setTimeout(() => showToast(
            `🎯 ${alerts.length} wishlist card${alerts.length > 1 ? 's' : ''} at or below target price!`,
            5000
          ), 1500)
        }
      } catch { /* ignore */ }
    }
    load()
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const openStoreSearch = useCallback((cardName) => {
    setStoreSearch(cardName)
    setPageState('store')
    window.history.pushState({ page: 'store' }, '', '#store')
    document.title = PAGE_TITLES['store']
  }, [])

  const pageProps = {
    user, matches, setMatches, collection, setCollection, showToast, setPage,
    openLogMatch: () => setShowLogMatch(true),
    openAddCard: (prefill) => { setPrefillCard(prefill || null); setShowAddCard(true) },
    openCamera: () => setShowCamera(true),
    openDecklist: (deck) => setDecklistDeck(deck),
    setDeckModalOpen,
    openStoreSearch,
  }

  return (
    <div id="app">
      <Sidebar page={page} setPage={setPage} user={user} onAuthClick={() => setShowAuth(true)} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div id="overlay" className={sidebarOpen ? 'open' : ''} onClick={() => setSidebarOpen(false)} />
      <div id="main">
        <TopBar page={page} user={user} onLogMatch={() => setShowLogMatch(true)} onAuthClick={() => setShowAuth(true)} onMenuClick={() => setSidebarOpen(!sidebarOpen)} onLogoClick={() => setPage('dashboard')} />
        <div id="content">
          {!loading && (
            <>
              {page === 'dashboard'  && <Dashboard {...pageProps} />}
              {page === 'log'        && <MatchLog {...pageProps} />}
              {page === 'stats'      && <Stats {...pageProps} />}
              {page === 'news'       && <News {...pageProps} />}
              {page === 'cards'      && <CardLookup {...pageProps} />}
              {page === 'collection' && <Collection {...pageProps} />}
              {page === 'releases'   && <SetReleases />}
              {page === 'friends'    && <Friends {...pageProps} />}
              {page === 'decks'      && <Decks {...pageProps} />}
              {page === 'wishlist'   && <Wishlist {...pageProps} />}
              {page === 'store'     && <Store initialSearch={storeSearch} onSearchUsed={() => setStoreSearch('')} />}
              {page === 'about'     && <About />}
              {page === 'admin'     && <AdminPanel user={user} />}
            </>
          )}
        </div>
      </div>
      <MobileNav page={page} setPage={setPage} openLogMatch={() => setShowLogMatch(true)} openCamera={() => setShowCamera(true)} openAddCard={(prefill) => { setPrefillCard(prefill || null); setShowAddCard(true) }} />

      {showAuth    && <AuthModal onClose={() => setShowAuth(false)} showToast={showToast} user={user} />}
      {showLogMatch && <LogMatchModal onClose={() => setShowLogMatch(false)} {...pageProps} />}
      {showAddCard  && <AddCardModal onClose={() => setShowAddCard(false)} prefill={prefillCard} {...pageProps} />}
      {showCamera   && <CameraModal onClose={() => setShowCamera(false)} {...pageProps} />}
      {decklistDeck && <DecklistModal deck={decklistDeck} onClose={() => setDecklistDeck(null)} setPage={setPage} />}
      {toast && <Toast msg={toast} />}
    </div>
  )
}
