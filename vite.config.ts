import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// PWA plugin (vite-plugin-pwa, injectManifest) gắn ở P4 — xem pwa-offline/skill.md
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
