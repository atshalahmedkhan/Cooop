import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/__tests__/**/*.test.ts'],
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: {
      concurrent: false,
    },
  },
})
