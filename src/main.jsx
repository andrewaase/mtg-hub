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
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
