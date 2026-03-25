import { useState, useEffect, useCallback } from 'react'
import { supabase, hasSupabase } from './lib/supabase'
import { getMatches, getCollection } from './lib/db'
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
import MetaTracker from './pages/MetaTracker'
import Friends from './pages/Friends'

export default function App() {
  const [page, setPage] = useState('dashboard')
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

  // Load data
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [m, c] = await Promise.all([getMatches(user?.id), getCollection(user?.id)])
      setMatches(m)
      setCollection(c)
      setLoading(false)
    }
    load()
  }, [user])

  const pageProps = {
    user, matches, setMatches, collection, setCollection, showToast, setPage,
    openLogMatch: () => setShowLogMatch(true),
    openAddCard: (prefill) => { setPrefillCard(prefill || null); setShowAddCard(true) },
    openCamera: () => setShowCamera(true),
    openDecklist: (deck) => setDecklistDeck(deck),
  }

  return (
    <div id="app">
      <Sidebar page={page} setPage={setPage} user={user} onAuthClick={() => setShowAuth(true)} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div id="overlay" className={sidebarOpen ? 'open' : ''} onClick={() => setSidebarOpen(false)} />
      <div id="main">
        <TopBar page={page} user={user} onLogMatch={() => setShowLogMatch(true)} onAuthClick={() => setShowAuth(true)} onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div id="content">
          {!loading && (
            <>
              {page === 'dashboard' && <Dashboard {...pageProps} />}
              {page === 'log' && <MatchLog {...pageProps} />}
              {page === 'stats' && <Stats {...pageProps} />}
              {page === 'news' && <News {...pageProps} />}
              {page === 'cards' && <CardLookup {...pageProps} />}
              {page === 'collection' && <Collection {...pageProps} />}
              {page === 'meta' && <MetaTracker {...pageProps} />}
              {page === 'friends' && <Friends {...pageProps} />}
            </>
          )}
        </div>
      </div>
      <MobileNav page={page} setPage={setPage} />

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} showToast={showToast} />}
      {showLogMatch && <LogMatchModal onClose={() => setShowLogMatch(false)} {...pageProps} />}
      {showAddCard && <AddCardModal onClose={() => setShowAddCard(false)} prefill={prefillCard} {...pageProps} />}
      {showCamera && <CameraModal onClose={() => setShowCamera(false)} {...pageProps} />}
      {decklistDeck && <DecklistModal deck={decklistDeck} onClose={() => setDecklistDeck(null)} setPage={setPage} />}
      {toast && <Toast msg={toast} />}
    </div>
  )
}
