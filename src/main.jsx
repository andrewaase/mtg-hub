import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Restore saved theme preference before first paint
const savedTheme = localStorage.getItem('mm-theme')
if (savedTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
