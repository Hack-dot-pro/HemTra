import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/features/*/logic.ts', 'src/features/auth/*.ts'],
      reporter: ['text-summary'],
    },
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
