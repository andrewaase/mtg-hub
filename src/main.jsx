import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import './styles.css'

// Restore saved theme preference before first paint
const savedTheme = localStorage.getItem('mm-theme')
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')

// Mark <html> so CSS safe-area rules and native tweaks activate
if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('capacitor')
  document.documentElement.classList.add(`platform-${Capacitor.getPlatform()}`)

  // In the native app the webview origin is capacitor://localhost, so relative
  // "/.netlify/functions/*" paths 404 (there's no Netlify server in the bundle).
  // Rewrite them to the deployed site so news, prices, friends, etc. all work.
  const API_ORIGIN = 'https://www.manamint.store'
  const _fetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    try {
      if (typeof input === 'string' && input.startsWith('/.netlify/')) {
        input = API_ORIGIN + input
      } else if (input instanceof Request && input.url.includes('/.netlify/')) {
        const abs = input.url.replace(/^[a-z]+:\/\/localhost/i, API_ORIGIN)
        if (abs !== input.url) input = new Request(abs, input)
      }
    } catch { /* fall through with original input */ }
    return _fetch(input, init)
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
