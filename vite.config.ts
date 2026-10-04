import { mkdirSync, writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Mỗi lần build 1 id — client so nó với GET /version.json (no-store) để biết
// bản trên máy chủ đã đổi (design §8.6). Không ghi file tĩnh ở public/ vì
// tab đang cache không thấy file mới.
const buildId = Date.now().toString(36)

function versionJson(): Plugin {
  return {
    name: 'hemtra:version-json',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist', { recursive: true })
      writeFileSync(
        'dist/version.json',
        `${JSON.stringify({ version: buildId, builtAt: new Date().toISOString() })}\n`,
      )
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionJson(),
    VitePWA({
      // P4-T1: injectManifest để tự kiểm soát cache (skill §1); tự đăng ký SW
      // ở src/lib/pwaClient.ts (injectRegister: false).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      devOptions: { enabled: false },
      manifest: {
        name: 'Hẻm Trà',
        short_name: 'Hẻm Trà',
        lang: 'vi',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#1e8fe8',
        background_color: '#0b1b33',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
})
