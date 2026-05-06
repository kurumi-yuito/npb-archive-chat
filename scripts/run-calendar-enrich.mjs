/**
 * 2025 SQLite の欠損 events を埋める（NPB_RUN_ENRICH_CALENDAR を付与）。
 * 使い方: node scripts/run-calendar-enrich.mjs
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env, NPB_RUN_ENRICH_CALENDAR: '1' }
const child = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    'src/enrich-calendar.production.test.ts',
    '-c',
    'vitest.config.ts',
    '--testTimeout',
    '28800000',
    '--no-file-parallelism',
  ],
  { cwd: path.join(root, 'packages/db'), stdio: 'inherit', env },
)
child.on('exit', (code) => process.exit(code ?? 1))
