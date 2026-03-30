import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Tesseract.js uses dynamic workers that Vite's optimizer doesn't handle well
  optimizeDeps: {
    exclude: ['tesseract.js']
  }
})
