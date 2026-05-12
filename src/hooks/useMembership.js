// src/hooks/useMembership.js
// Fetches the current user's membership status from the server.
// Returns tier, scan limits, and a refresh function.
import { useState, useEffect, useCallback } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'

const DEFAULT = {
  tier:               'free',
  isPro:              false,
  membershipEnd:      null,
  freeMonthsRemaining: 0,
  scansToday:         0,
  scanLimit:          100,
  deckLimit:          10,
  scansLeft:          100,
  canScan:            true,
  loaded:             false,
}

export function useMembership(user) {
  const [status, setStatus] = useState(DEFAULT)

  const refresh = useCallback(async () => {
    if (!user || !hasSupabase) {
      setStatus({ ...DEFAULT, loaded: true })
      return
    }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setStatus({ ...DEFAULT, loaded: true }); return }

      const res  = await fetch('/.netlify/functions/get-membership', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus({ ...data, loaded: true })
    } catch (err) {
      console.warn('[useMembership] fetch failed:', err.message)
      setStatus({ ...DEFAULT, loaded: true })
    }
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...status, refresh }
}
