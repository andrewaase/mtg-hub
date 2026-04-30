import { supabase, hasSupabase } from './supabase'

const LS_KEY = 'mtg-hub-v1'

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function lsSet(data) {
  const current = lsGet()
  localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...data }))
}

// ── MATCHES ──────────────────────────────────────────
export async function getMatches(userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('matches').select('*').eq('user_id', userId).order('date', { ascending: false })
    return data || []
  }
  return lsGet().matches || []
}

export async function addMatch(match, userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('matches').insert({ ...match, user_id: userId }).select().single()
    return data
  }
  const matches = lsGet().matches || []
  const newMatch = { ...match, id: Date.now() }
  lsSet({ matches: [newMatch, ...matches] })
  return newMatch
}

export async function deleteMatch(id, userId) {
  if (hasSupabase && userId) {
    await supabase.from('matches').delete().eq('id', id).eq('user_id', userId)
    return
  }
  const matches = (lsGet().matches || []).filter(m => m.id !== id)
  lsSet({ matches })
}

// ── COLLECTION ────────────────────────────────────────
export async function getCollection(userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('collection').select('*').eq('user_id', userId)
    return data || []
  }
  return lsGet().collection || []
}

export async function addCard(card, userId) {
  if (hasSupabase && userId) {
    // Check if card already exists for this user
    const { data: existing, error: selectErr } = await supabase
      .from('collection').select('*').eq('user_id', userId).eq('name', card.name).maybeSingle()
    if (selectErr) {
      console.error('[db] collection select error:', selectErr)
      throw new Error(selectErr.message)
    }
    if (existing) {
      const { data, error: updateErr } = await supabase
        .from('collection').update({ qty: existing.qty + card.qty }).eq('id', existing.id).select().single()
      if (updateErr) {
        console.error('[db] collection update error:', updateErr)
        throw new Error(updateErr.message)
      }
      return data
    }
    const { data, error: insertErr } = await supabase
      .from('collection').insert({ ...card, user_id: userId }).select().single()
    if (insertErr) {
      console.error('[db] collection insert error:', insertErr)
      throw new Error(insertErr.message)
    }
    return data
  }
  const collection = lsGet().collection || []
  const existing = collection.find(c => c.name.toLowerCase() === card.name.toLowerCase())
  if (existing) {
    existing.qty += card.qty
    lsSet({ collection })
    return existing
  }
  const newCard = { ...card, id: Date.now() }
  lsSet({ collection: [...collection, newCard] })
  return newCard
}

// ── STORE LISTINGS ────────────────────────────────────
// Upsert a store listing: if an active listing with the same name +
// condition + is_foil already exists, increment qty_available instead of
// creating a duplicate row.  Returns { merged: bool, id }.
export async function upsertStoreListing({ name, set_name, condition, is_foil, price, img_url, scryfall_id, qty = 1 }) {
  // Find any existing listing that matches on name + condition + foil
  const { data: existing, error: selErr } = await supabase
    .from('store_listings')
    .select('id, qty_available')
    .eq('name', name)
    .eq('condition', condition || 'NM')
    .eq('is_foil', is_foil || false)
    .maybeSingle()

  if (selErr) {
    console.error('[db] upsertStoreListing select error:', selErr)
    throw new Error(selErr.message)
  }

  if (existing) {
    // Existing listing — just bump the quantity (and re-activate if hidden)
    const { error: updErr } = await supabase
      .from('store_listings')
      .update({ qty_available: existing.qty_available + qty, active: true })
      .eq('id', existing.id)
    if (updErr) {
      console.error('[db] upsertStoreListing update error:', updErr)
      throw new Error(updErr.message)
    }
    return { merged: true, id: existing.id }
  }

  // No match — create a fresh listing
  const { data, error: insErr } = await supabase
    .from('store_listings')
    .insert({ name, set_name, condition: condition || 'NM', is_foil: is_foil || false, price, qty_available: qty, img_url, active: true, scryfall_id })
    .select('id')
    .single()
  if (insErr) {
    console.error('[db] upsertStoreListing insert error:', insErr)
    throw new Error(insErr.message)
  }
  return { merged: false, id: data.id }
}

export async function removeCard(id, userId) {
  if (hasSupabase && userId) {
    await supabase.from('collection').delete().eq('id', id).eq('user_id', userId)
    return
  }
  const collection = (lsGet().collection || []).filter(c => c.id !== id)
  lsSet({ collection })
}

// ── FRIENDS (Supabase only) ───────────────────────────
export async function getFriends(userId) {
  if (!hasSupabase || !userId) return []
  const { data } = await supabase.from('friendships').select(`
    *,
    friend:profiles!friendships_friend_id_fkey(id, username, avatar_color)
  `).eq('user_id', userId).eq('status', 'accepted')
  return data || []
}

export async function getPendingRequests(userId) {
  if (!hasSupabase || !userId) return []
  const { data } = await supabase.from('friendships').select(`
    *,
    requester:profiles!friendships_user_id_fkey(id, username, avatar_color)
  `).eq('friend_id', userId).eq('status', 'pending')
  return data || []
}

export async function sendFriendRequest(userId, friendId) {
  if (!hasSupabase) return
  await supabase.from('friendships').insert({ user_id: userId, friend_id: friendId, status: 'pending' })
}

export async function acceptFriendRequest(requestId) {
  if (!hasSupabase) return
  await supabase.from('friendships').update({ status: 'accepted' }).eq('id', requestId)
}

export async function searchUsers(query) {
  if (!hasSupabase) return []
  const { data } = await supabase.from('profiles').select('id, username, avatar_color').ilike('username', `%${query}%`).limit(8)
  return data || []
}

export async function getFriendCollection(friendId) {
  if (!hasSupabase) return []
  const { data } = await supabase.from('collection').select('*').eq('user_id', friendId)
  return data || []
}

export async function getWantList(userId) {
  if (!hasSupabase || !userId) return []
  const { data } = await supabase.from('trade_wants').select('*').eq('user_id', userId)
  return data || []
}

export async function addWant(cardName, userId) {
  if (!hasSupabase || !userId) return
  await supabase.from('trade_wants').upsert({ user_id: userId, card_name: cardName })
}

export async function removeWant(cardName, userId) {
  if (!hasSupabase || !userId) return
  await supabase.from('trade_wants').delete().eq('user_id', userId).eq('card_name', cardName)
}

// ── DECKS ─────────────────────────────────────────────
export async function getDecks(userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('decks').select('*').eq('user_id', userId).order('updated_at', { ascending: false })
    return data || []
  }
  return lsGet().decks || []
}

export async function saveDeck(deck, userId) {
  const now = new Date().toISOString()
  if (hasSupabase && userId) {
    if (deck.id) {
      const { data, error } = await supabase.from('decks').update({ ...deck, updated_at: now }).eq('id', deck.id).eq('user_id', userId).select().single()
      if (error) { console.error('[db] saveDeck update error:', error); throw new Error(error.message) }
      return data || deck
    }
    const { data, error } = await supabase.from('decks').insert({ ...deck, user_id: userId, created_at: now, updated_at: now }).select().single()
    if (error) { console.error('[db] saveDeck insert error:', error); throw new Error(error.message) }
    return data || deck
  }
  // Not signed in — localStorage only (won't persist across sessions)
  const decks = lsGet().decks || []
  if (deck.id) {
    const updated = decks.map(d => d.id === deck.id ? { ...deck, updatedAt: now } : d)
    lsSet({ decks: updated })
    return { ...deck, updatedAt: now }
  }
  const newDeck = { ...deck, id: Date.now(), createdAt: now, updatedAt: now }
  lsSet({ decks: [newDeck, ...decks] })
  return newDeck
}

export async function deleteDeck(id, userId) {
  if (hasSupabase && userId) {
    await supabase.from('decks').delete().eq('id', id).eq('user_id', userId)
    return
  }
  const decks = (lsGet().decks || []).filter(d => d.id !== id)
  lsSet({ decks })
}

// ── EXPORT / IMPORT ───────────────────────────────────
export function exportData(matches, collection) {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), matches, collection }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `mtg-hub-backup-${new Date().toISOString().slice(0,10)}.json`
  a.click()
}

export function importData(jsonStr) {
  try {
    const data = JSON.parse(jsonStr)
    lsSet({ matches: data.matches || [], collection: data.collection || [] })
    return { matches: data.matches || [], collection: data.collection || [] }
  } catch (e) {
    throw new Error('Invalid backup file format')
  }
}
