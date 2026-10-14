import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // Il test della CSP (src/lib/csp.test.ts) legge l'header documentato in docs/deploy, fuori dal progetto
  server: {
    fs: { allow: [import.meta.dirname, path.resolve(import.meta.dirname, '../../docs/deploy')] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
