import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'apps/web/vitest.config.ts',
  'packages/crawler/vitest.config.ts',
  'packages/parser/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'packages/schemas/vitest.config.ts',
])
