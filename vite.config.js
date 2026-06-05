import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Build stamp — baked in at build time so you can verify on-device that the
// running app matches your latest build (open the menu; the stamp is in the footer).
function gitHash() {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'nogit' }
}
const BUILD_TIME = new Date().toISOString()
const BUILD_HASH = gitHash()

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    __BUILD_HASH__: JSON.stringify(BUILD_HASH),
  },
  // Tesseract.js uses dynamic workers that Vite's optimizer doesn't handle well
  optimizeDeps: {
    exclude: ['tesseract.js']
  }
})
