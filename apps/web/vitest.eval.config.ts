import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.eval.ts'],
    environment: 'node',
  },
})
