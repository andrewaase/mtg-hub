// src/lib/revenuecat.js
// RevenueCat (Apple IAP) wrapper. Native-iOS only; on web every call is a no-op
// so the existing Stripe flow is used instead. Pro is gated by the "pro"
// entitlement; the RevenueCat webhook mirrors purchases into Supabase membership.

import { isNative, isIOS } from './native'

const ENTITLEMENT_ID = 'pro'
// Public RevenueCat Apple SDK key (safe to ship in the client bundle).
const API_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY || ''

let _configured = false

/** RevenueCat purchases are only available in the native iOS app. */
export const iapAvailable = isNative && isIOS && !!API_KEY

async function mod() {
  return import('@revenuecat/purchases-capacitor')
}

/** Configure RevenueCat and associate the session with the Supabase user id. */
export async function initRevenueCat(userId) {
  if (!iapAvailable) return
  try {
    const { Purchases, LOG_LEVEL } = await mod()
    if (!_configured) {
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN })
      await Purchases.configure({ apiKey: API_KEY, appUserID: userId || undefined })
      _configured = true
    } else if (userId) {
      await Purchases.logIn({ appUserID: userId })
    }
  } catch (e) { console.warn('[RevenueCat] init failed:', e) }
}

export async function logoutRevenueCat() {
  if (!iapAvailable || !_configured) return
  try { const { Purchases } = await mod(); await Purchases.logOut() } catch { /* anonymous — ignore */ }
}

/** True if the current customer holds the active "pro" entitlement. */
export async function isRevenueCatPro() {
  if (!iapAvailable) return false
  try {
    const { Purchases } = await mod()
    const { customerInfo } = await Purchases.getCustomerInfo()
    return !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]
  } catch { return false }
}

/** Pick the package matching the chosen billing period (falls back to first). */
async function proPackage(period = 'monthly') {
  const { Purchases } = await mod()
  const offerings = await Purchases.getOfferings()
  const pkgs = offerings?.current?.availablePackages || []
  const want = period === 'annual' ? 'ANNUAL' : 'MONTHLY'
  return pkgs.find(p => p.packageType === want) || pkgs[0] || null
}

/** Launch the Apple purchase sheet. Returns { active } once complete. */
export async function purchasePro(period = 'monthly') {
  if (!iapAvailable) throw new Error('In-app purchase is only available in the iOS app')
  const { Purchases } = await mod()
  const pkg = await proPackage(period)
  if (!pkg) throw new Error('No subscription is available right now')
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
  return { active: !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] }
}

/** Open iOS' native Manage Subscriptions screen. */
export async function manageAppleSubscription() {
  if (!iapAvailable) return
  try {
    const { Purchases } = await mod()
    if (Purchases.showManageSubscriptions) await Purchases.showManageSubscriptions()
  } catch (e) { console.warn('[RevenueCat] manage subscription failed:', e) }
}

/** Restore a previous purchase (required button per App Review). */
export async function restorePro() {
  if (!iapAvailable) return { active: false }
  const { Purchases } = await mod()
  const { customerInfo } = await Purchases.restorePurchases()
  return { active: !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] }
}

/** Was the purchase cancelled by the user? (don't show an error toast for that) */
export async function isUserCancelled(err) {
  try {
    const { PURCHASES_ERROR_CODE } = await mod()
    return err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || /cancel/i.test(err?.message || '')
  } catch { return /cancel/i.test(err?.message || '') }
}
