// src/lib/native.js
// Utilities for detecting and interacting with the native Capacitor environment.
// All imports are lazy so this file is safe to import on web too.

import { Capacitor } from '@capacitor/core'

/** True when running inside a Capacitor native app (iOS or Android) */
export const isNative = Capacitor.isNativePlatform()

/** 'ios' | 'android' | 'web' */
export const platform = Capacitor.getPlatform()

export const isIOS     = platform === 'ios'
export const isAndroid = platform === 'android'

/**
 * Trigger a light haptic tap (no-op on web).
 * Import and call this on card-scan success, button presses, etc.
 */
export async function hapticTap() {
  if (!isNative) return
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

export async function hapticSuccess() {
  if (!isNative) return
  const { Haptics, NotificationType } = await import('@capacitor/haptics')
  await Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}

/**
 * Set status bar style.
 * Call with 'dark' or 'light' depending on your current page background.
 */
export async function setStatusBar(style = 'dark') {
  if (!isNative) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light }).catch(() => {})
}

/**
 * Register a hardware back-button handler (Android only).
 * Returns a cleanup function — call it in useEffect return.
 */
export function onAndroidBack(handler) {
  if (!isAndroid) return () => {}
  let listener
  import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', handler).then(l => { listener = l })
  })
  return () => { listener?.remove() }
}
