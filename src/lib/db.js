import { supabase, hasSupabase } from './supabase'

const LS_KEY = 'mtg-hub-v1'

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function lsSet(data) {
  const current = lsGet()
  localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...data }))
}

// Clears the guest-mode local cache (collection/matches/wishlist/decks).
// Called on sign-out so a previously-migrated account's data doesn't
// reappear as if it belongs to the signed-out guest session.
export function clearLocalCache() {
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

//  MATCHES
// DB columns are snake_case; JS objects use camelCase — map both ways.
function matchRowToObj(row) {
  return {
    id:       row.id,
    format:   row.format,
    date:     row.played_date ?? row.created_at?.split('T')[0] ?? '',
    myDeck:   row.my_deck ?? '',
    myColors: row.my_deck_type ?? '',
    oppDeck:  row.opponent_deck ?? '',
    oppType:  row.opponent_deck_type ?? '',
    result:   row.result,
    notes:    row.notes ?? '',
  }
}

function matchToRow(match, userId) {
  return {
    user_id:            userId,
    format:             match.format,
    played_date:        match.date,
    my_deck:            match.myDeck,
    my_deck_type:       match.myColors,
    opponent_deck:      match.oppDeck,
    opponent_deck_type: match.oppType,
    result:             match.result,
    notes:              match.notes,
  }
}

export async function getMatches(userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('matches').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    return (data || []).map(matchRowToObj)
  }
  return lsGet().matches || []
}

export async function addMatch(match, userId) {
  if (hasSupabase && userId) {
    const { data, error } = await supabase.from('matches').insert(matchToRow(match, userId)).select().single()
    if (error) { console.error('[db] addMatch error:', error); throw new Error(error.message) }
    // Fall back to the submitted form data if the insert succeeded but the
    // select-back returned nothing (e.g. RLS) — callers must never receive null.
    return data ? matchRowToObj(data) : { ...match, id: Date.now() }
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

//  COLLECTION 
// DB columns are snake_case; JS objects use camelCase — map both ways.
function collectionRowToCard(row) {
  return {
    id:           row.id,
    name:         row.name,
    qty:          row.qty,
    condition:    row.condition,
    setName:      row.set_name      ?? row.setName      ?? null,
    isFoil:       row.is_foil       ?? row.isFoil       ?? false,
    img:          row.img           ?? null,
    colors:       row.colors        ?? [],
    price:        row.price         ?? null,
    tcgplayerUrl: row.tcgplayer_url ?? row.tcgplayerUrl ?? null,
    scryfallId:   row.scryfall_id   ?? row.scryfallId   ?? null,
    forTrade:     row.in_trade_binder ?? false,
  }
}

export async function getCollection(userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('collection').select('*').eq('user_id', userId)
    return (data || []).map(collectionRowToCard)
  }
  return lsGet().collection || []
}

export async function addCard(card, userId) {
  if (hasSupabase && userId) {
    // Dedup key: scryfall_id + is_foil + condition uniquely identifies a specific
    // printing variant (art, foiling, set). Fall back to name-only when no
    // scryfall_id so bulk-imported cards still merge as before.
    let dupQuery = supabase.from('collection').select('*').eq('user_id', userId)
    if (card.scryfallId) {
      dupQuery = dupQuery
        .eq('scryfall_id', card.scryfallId)
        .eq('is_foil',     card.isFoil    || false)
        .eq('condition',   card.condition || 'NM')
    } else {
      dupQuery = dupQuery
        .eq('name',    card.name)
        .is('scryfall_id', null)
        .eq('is_foil', card.isFoil    || false)
        .eq('condition', card.condition || 'NM')
    }
    const { data: existing, error: selectErr } = await dupQuery.maybeSingle()
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
      return collectionRowToCard(data)
    }
    // Explicit column mapping — avoids camelCase/snake_case mismatches
    const baseRow = {
      user_id:       userId,
      name:          card.name,
      qty:           card.qty,
      condition:     card.condition   ?? 'NM',
      set_name:      card.setName     ?? null,
      img:           card.img         ?? null,
      colors:        card.colors      ?? [],
      price:         card.price       ?? null,
      tcgplayer_url: card.tcgplayerUrl ?? null,
      ...(card.scryfallId ? { scryfall_id: card.scryfallId } : {}),
      ...(card.isFoil === true ? { is_foil: true } : {}),
    }
    let { data, error: insertErr } = await supabase.from('collection').insert(baseRow).select().single()
    if (insertErr?.message?.includes('is_foil')) {
      // is_foil column not yet in DB schema — retry without it
      const { is_foil: _f, ...rowWithoutFoil } = baseRow
      const { data: d2, error: e2 } = await supabase.from('collection').insert(rowWithoutFoil).select().single()
      data = d2; insertErr = e2
    }
    if (insertErr) {
      console.error('[db] collection insert error:', insertErr)
      throw new Error(insertErr.message)
    }
    return collectionRowToCard(data)
  }
  const collection = lsGet().collection || []
  // localStorage: match on scryfallId + isFoil + condition if available
  const existing = collection.find(c =>
    card.scryfallId
      ? c.scryfallId === card.scryfallId && (c.isFoil || false) === (card.isFoil || false) && (c.condition || 'NM') === (card.condition || 'NM')
      : c.name.toLowerCase() === card.name.toLowerCase() && !c.scryfallId && (c.isFoil || false) === (card.isFoil || false)
  )
  if (existing) {
    existing.qty += card.qty
    lsSet({ collection })
    return existing
  }
  const newCard = { ...card, id: Date.now() }
  lsSet({ collection: [...collection, newCard] })
  return newCard
}

//  UPDATE COLLECTION CARD 
export async function updateCollectionCard(id, patch, userId) {
  const dbPatch = {}
  if (patch.qty        !== undefined) dbPatch.qty              = patch.qty
  if (patch.condition  !== undefined) dbPatch.condition        = patch.condition
  if (patch.scryfallId != null)        dbPatch.scryfall_id     = patch.scryfallId
  if (patch.forTrade   !== undefined) dbPatch.in_trade_binder  = patch.forTrade
  if (hasSupabase && userId && Object.keys(dbPatch).length > 0) {
    await supabase.from('collection').update(dbPatch).eq('id', id).eq('user_id', userId)
  }
}

//  BULK COLLECTION IMPORT 
// Efficiently imports many cards at once: 1 select + 1 batch insert + N qty-updates.
// cards: [{ name, qty, condition, setName, img, colors, price }]
// Returns the full updated collection array.
export async function bulkAddCards(cards, userId, { onProgress } = {}) {
  if (hasSupabase && userId) {
    // Fetch what the user already has so we can dedup
    const { data: existing } = await supabase
      .from('collection').select('id, name, qty, scryfall_id, is_foil, condition').eq('user_id', userId)
    // Key: scryfallId|isFoil|condition when available, else name|isFoil
    const makeKey = (r) => r.scryfall_id
      ? `${r.scryfall_id}|${!!r.is_foil}|${r.condition || 'NM'}`
      : `${(r.name || '').toLowerCase()}|${!!r.is_foil}`
    const existingMap = Object.fromEntries((existing || []).map(r => [makeKey(r), r]))

    const toInsert = []
    const toUpdate = [] // { id, qty }
    for (const card of cards) {
      const cardKey = card.scryfallId
        ? `${card.scryfallId}|${!!card.isFoil}|${card.condition || 'NM'}`
        : `${(card.name || '').toLowerCase()}|${!!card.isFoil}`
      const ex = existingMap[cardKey]
      if (ex) {
        toUpdate.push({ id: ex.id, qty: ex.qty + (card.qty || 1) })
      } else {
        toInsert.push({
          user_id:       userId,
          name:          card.name,
          qty:           card.qty           ?? 1,
          condition:     card.condition     ?? 'NM',
          set_name:      card.setName       ?? null,
          img:           card.img           ?? null,
          colors:        card.colors        ?? [],
          price:         card.price         ?? null,
          tcgplayer_url: card.tcgplayerUrl  ?? null,
          ...(card.scryfallId   ? { scryfall_id: card.scryfallId } : {}),
          ...(card.isFoil === true ? { is_foil: true }             : {}),
        })
      }
    }

    // Batch insert all new cards in one request
    if (toInsert.length > 0) {
      let { error } = await supabase.from('collection').insert(toInsert)
      if (error?.message?.includes('is_foil')) {
        // is_foil column not in DB — strip it and retry
        const { error: e2 } = await supabase.from('collection').insert(
          toInsert.map(({ is_foil: _f, ...r }) => r)
        )
        error = e2
      }
      if (error) throw new Error(error.message)
    }
    onProgress?.(toInsert.length, cards.length)

    // Update existing card quantities one at a time (no batch update in PostgREST)
    for (let i = 0; i < toUpdate.length; i++) {
      const u = toUpdate[i]
      await supabase.from('collection').update({ qty: u.qty }).eq('id', u.id)
      onProgress?.(toInsert.length + i + 1, cards.length)
    }

    // Return the refreshed collection
    const { data: refreshed } = await supabase.from('collection').select('*').eq('user_id', userId)
    return (refreshed || []).map(collectionRowToCard)
  }

  //  localStorage fallback 
  const stored = lsGet()
  const collection = stored.collection || []
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    const idx = collection.findIndex(c => c.name.toLowerCase() === card.name.toLowerCase())
    if (idx >= 0) {
      collection[idx].qty += card.qty || 1
    } else {
      collection.push({ ...card, id: Date.now() + i })
    }
    onProgress?.(i + 1, cards.length)
  }
  lsSet({ collection })
  return collection
}

//  STORE LISTINGS 
// Upsert a store listing: if an active listing for the exact same card
// variant already exists, increment qty_available instead of creating a
// duplicate row.  Returns { merged: bool, id }.
//
// Dedup key (in priority order):
//   1. scryfall_id + condition + is_foil  — unique per printing/art/foiling
//   2. name + condition + is_foil         — fallback for listings without scryfall_id
//
// This means a regular printing and a showcase/extended-art/foil printing of
// the same card will always be separate store listings with independent pricing.
export async function upsertStoreListing({ name, set_name, condition, is_foil, price, img_url, scryfall_id, qty = 1 }) {
  // Build the dedup query
  let dupQuery = supabase.from('store_listings').select('id, qty_available').eq('active', true)
  if (scryfall_id) {
    dupQuery = dupQuery
      .eq('scryfall_id', scryfall_id)
      .eq('condition',   condition || 'NM')
      .eq('is_foil',     is_foil   || false)
  } else {
    dupQuery = dupQuery
      .eq('name',      name)
      .is('scryfall_id', null)
      .eq('condition', condition || 'NM')
      .eq('is_foil',   is_foil   || false)
  }
  const { data: existing, error: selErr } = await dupQuery.maybeSingle()

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

//  FRIENDS (Supabase only) 
// Both getFriends and getPendingRequests go through a Netlify function (service key)
// because RLS on `friendships` blocks the recipient from reading rows they don't own.
async function fetchFriendsBundle(accessToken) {
  try {
    const res = await fetch('/.netlify/functions/get-friends', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) return { friends: [], pendingRequests: [] }
    return await res.json()
  } catch {
    return { friends: [], pendingRequests: [] }
  }
}

export async function getFriends(userId, accessToken) {
  if (!hasSupabase || !userId || !accessToken) return []
  const { friends } = await fetchFriendsBundle(accessToken)
  return friends || []
}

export async function getPendingRequests(userId, accessToken) {
  if (!hasSupabase || !userId || !accessToken) return []
  const { pendingRequests } = await fetchFriendsBundle(accessToken)
  return pendingRequests || []
}

export async function sendFriendRequest(userId, friendId) {
  if (!hasSupabase) return { mutual: false }
  // Check if the other person already sent us a request (mutual → auto-accept)
  const { data: existing } = await supabase
    .from('friends').select('id, status')
    .eq('user_id', friendId).eq('friend_id', userId).maybeSingle()
  if (existing?.status === 'accepted') return { mutual: false, alreadyFriends: true }
  if (existing) {
    // Mutual request — accept theirs and we're done (no second row needed)
    await supabase.from('friends').update({ status: 'accepted' }).eq('id', existing.id)
    return { mutual: true, requestId: existing.id }
  }
  const { data } = await supabase
    .from('friends')
    .insert({ user_id: userId, friend_id: friendId, status: 'pending' })
    .select().single()
  return { mutual: false, requestId: data?.id }
}

export async function acceptFriendRequest(requestId) {
  if (!hasSupabase) return
  await supabase.from('friends').update({ status: 'accepted' }).eq('id', requestId)
}

export async function acceptFriendRequestByUsers(requesterId, accessToken) {
  try {
    const res = await fetch('/.netlify/functions/accept-friend-request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body:    JSON.stringify({ requesterId }),
    })
    if (!res.ok) return false
    const json = await res.json()
    return !!json.ok
  } catch {
    return false
  }
}

// Deny via Netlify function (service key) so RLS doesn't block the recipient
export async function denyFriendRequestByUsers(requesterId, accessToken) {
  try {
    await fetch('/.netlify/functions/accept-friend-request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body:    JSON.stringify({ requesterId, action: 'deny' }),
    })
  } catch { /* non-critical */ }
}

//  NOTIFICATIONS 

export async function getNotifications(userId) {
  if (!hasSupabase || !userId) return []
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  return data || []
}

export async function markNotificationRead(id) {
  if (!hasSupabase) return
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}

export async function markAllNotificationsRead(userId) {
  if (!hasSupabase) return
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
}

export async function deleteNotification(id) {
  if (!hasSupabase) return
  await supabase.from('notifications').delete().eq('id', id)
}

export async function deleteAllNotifications(userId) {
  if (!hasSupabase) return
  await supabase.from('notifications').delete().eq('user_id', userId)
}

export async function createNotification(targetUserId, type, title, bodyText, data, accessToken) {
  try {
    await fetch('/.netlify/functions/create-notification', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body:    JSON.stringify({ targetUserId, type, title, bodyText, data }),
    })
  } catch { /* non-critical, don't block the caller */ }
}

export async function searchUsers(query) {
  if (!hasSupabase) return []
  // Uses the search_usernames() SECURITY DEFINER function instead of a direct
  // table select, so friend-search returns only id/username/avatar_color and
  // never exposes the PII columns (full_name, address) on the profiles table.
  const { data } = await supabase.rpc('search_usernames', { q: query })
  return data || []
}

export async function findUserByEmail(email, accessToken) {
  const res = await fetch('/.netlify/functions/find-user-by-email', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body:    JSON.stringify({ email }),
  })
  return res.json()
}

export async function getFriendCollection(friendId, accessToken) {
  if (!hasSupabase) return []
  try {
    const res = await fetch('/.netlify/functions/get-friend-collection', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body:    JSON.stringify({ friendId }),
    })
    if (!res.ok) return []
    const { cards } = await res.json()
    return (cards || []).map(collectionRowToCard)
  } catch { return [] }
}

export async function removeFriend(friendRowId, accessToken) {
  try {
    const res = await fetch('/.netlify/functions/remove-friend', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body:    JSON.stringify({ friendRowId }),
    })
    const json = await res.json()
    return !!json.ok
  } catch { return false }
}

export async function createTrade(recipientId, items, message, accessToken) {
  const res = await fetch('/.netlify/functions/create-trade', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body:    JSON.stringify({ recipientId, items, message }),
  })
  return res.json()
}

export async function getTrades(accessToken) {
  try {
    const res = await fetch('/.netlify/functions/get-trades', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.trades || []
  } catch { return [] }
}

export async function reportUser({ reportedUserId, reportedEmail, reason }, accessToken) {
  const res = await fetch('/.netlify/functions/report-user', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body:    JSON.stringify({ reportedUserId, reportedEmail, reason }),
  })
  return res.json()
}

export async function banUser(userId, banned, accessToken) {
  const res = await fetch('/.netlify/functions/ban-user', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body:    JSON.stringify({ userId, banned }),
  })
  return res.json()
}

export async function respondTrade(tradeId, action, accessToken, opts = {}) {
  const res = await fetch('/.netlify/functions/respond-trade', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body:    JSON.stringify({ tradeId, action, ...opts }),
  })
  return res.json()
}

export async function getWantList(userId) {
  if (!hasSupabase || !userId) return []
  const { data, error } = await supabase.from('trade_wants').select('*').eq('user_id', userId)
  if (error) return []
  return data || []
}

export async function addWant(cardName, userId) {
  if (!hasSupabase || !userId) return
  const { error } = await supabase.from('trade_wants').upsert({ user_id: userId, card_name: cardName })
  if (error) console.warn('[db] trade_wants table missing — trade matching not yet set up')
}

export async function removeWant(cardName, userId) {
  if (!hasSupabase || !userId) return
  await supabase.from('trade_wants').delete().eq('user_id', userId).eq('card_name', cardName)
}

//  WISHLIST 
// Row shape in Supabase: id, user_id, name, target_price, current_price, img, set_name, added_at
// JS shape uses camelCase: targetPrice, currentPrice, setName, addedAt

function rowToItem(row) {
  return {
    id:           row.id,
    name:         row.name,
    targetPrice:  row.target_price  ?? null,
    currentPrice: row.current_price ?? null,
    img:          row.img           ?? null,
    setName:      row.set_name      ?? null,
    addedAt:      row.added_at,
  }
}

export async function getWishlist(userId) {
  if (hasSupabase && userId) {
    const { data } = await supabase.from('wishlist').select('*').eq('user_id', userId).order('added_at', { ascending: false })
    return (data || []).map(rowToItem)
  }
  return lsGet().wishlist || []
}

export async function addWishlistItem(item, userId) {
  if (hasSupabase && userId) {
    const { data, error } = await supabase.from('wishlist').insert({
      user_id:       userId,
      name:          item.name,
      target_price:  item.targetPrice  ?? null,
      current_price: item.currentPrice ?? null,
      img:           item.img          ?? null,
      set_name:      item.setName      ?? null,
    }).select().single()
    if (error) { console.error('[db] addWishlistItem error:', error); throw new Error(error.message) }
    return rowToItem(data)
  }
  const wishlist = lsGet().wishlist || []
  const newItem = { ...item, id: Date.now() }
  lsSet({ wishlist: [newItem, ...wishlist] })
  return newItem
}

export async function updateWishlistItem(id, updates, userId) {
  const dbUpdates = {}
  if ('targetPrice'  in updates) dbUpdates.target_price  = updates.targetPrice
  if ('currentPrice' in updates) dbUpdates.current_price = updates.currentPrice
  if (hasSupabase && userId) {
    await supabase.from('wishlist').update(dbUpdates).eq('id', id).eq('user_id', userId)
    return
  }
  const wishlist = (lsGet().wishlist || []).map(i => i.id === id ? { ...i, ...updates } : i)
  lsSet({ wishlist })
}

export async function removeWishlistItem(id, userId) {
  if (hasSupabase && userId) {
    await supabase.from('wishlist').delete().eq('id', id).eq('user_id', userId)
    return
  }
  const wishlist = (lsGet().wishlist || []).filter(i => i.id !== id)
  lsSet({ wishlist })
}

//  DECKS 
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

//  EXPORT / IMPORT 
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
