import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    setupFiles: ['./test/setup.ts'],
    css: false,
    // vitest 4 has no environmentMatchGlobs: the component tests are a project of their own, in jsdom; everything else runs in node
    projects: [
      { extends: true, test: { name: 'node', environment: 'node', include: ['test/**/*.test.{ts,tsx}'], exclude: ['test/components/**'] } },
      { extends: true, test: { name: 'components', environment: 'jsdom', include: ['test/components/**/*.test.{ts,tsx}'] } },
    ],
  },
})
