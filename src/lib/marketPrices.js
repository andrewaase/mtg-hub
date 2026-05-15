// marketPrices.js
// Reads pre-computed market movers from Supabase.
//
// The compute-market-movers Netlify function runs daily at 9am UTC.
// It fetches ALL competitive paper MTG cards ($0.50+) from Scryfall,
// stores a daily price snapshot, computes the top 100 gainers/losers
// vs ~7 days ago, and upserts results into the market_movers table.
//
// This file just reads the latest row — no Scryfall calls in the browser.

import { supabase } from './supabase'

/**
 * Fetch the most-recent pre-computed market movers from Supabase.
 * Returns:
 *   { gainers, losers, daysApart, refDate, computedDate, ready }
 * Each gainer/loser: { name, img, oldPrice, newPrice, dollarChange, pctChange }
 */
export async function fetchMarketMovers() {
  if (!supabase) return { gainers: [], losers: [], daysApart: 0, ready: false }

  try {
    const { data, error } = await supabase
      .from('market_movers')
      .select('gainers, losers, ref_date, days_apart, computed_date')
      .order('computed_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      return { gainers: [], losers: [], daysApart: 0, ready: false }
    }

    return {
      gainers:      Array.isArray(data.gainers) ? data.gainers : [],
      losers:       Array.isArray(data.losers)  ? data.losers  : [],
      daysApart:    data.days_apart    ?? 0,
      refDate:      data.ref_date      ?? null,
      computedDate: data.computed_date ?? null,
      ready:        true,
    }
  } catch {
    return { gainers: [], losers: [], daysApart: 0, ready: false }
  }
}
