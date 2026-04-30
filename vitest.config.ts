import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live in `tests/` and import @playwright/test, which
    // throws when loaded by vitest. Keep vitest scoped to co-located unit
    // and integration tests under `src/`.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
