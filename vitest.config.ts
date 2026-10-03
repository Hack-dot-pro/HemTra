import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // khớp vite.config.ts — test so version (P4-T6)
    __BUILD_ID__: JSON.stringify('test-build-id'),
  },
  resolve: {
    alias: [
      // virtual module của vite-plugin-pwa không tồn tại khi chạy vitest
      { find: 'virtual:pwa-register', replacement: '/src/test/virtualPwaRegister.ts' },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
        include: ['src/lib/**', 'src/features/*/logic.ts', 'src/features/*/api.ts', 'src/features/auth/*.ts', 'src/features/setup/*.ts'],
      reporter: ['text-summary'],
    },
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
