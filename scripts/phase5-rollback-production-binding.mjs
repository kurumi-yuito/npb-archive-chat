#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const LEGACY_DB_NAME = 'npb-archive-chat-import'
const LEGACY_DB_ID = '14c099c3-03ac-4307-9704-7a770b31d108'
const OLD_DEPLOY_VERSION_ID = 'f36ff5ad-a057-4adc-9aa7-a318fd535413'
const NORMALIZED_DB_NAME = 'npb-archive-chat-normalized'
const NORMALIZED_DB_ID = 'eb614de3-eb0c-4816-a7b2-8440e94093a8'

const args = parseArgs(process.argv.slice(2))
if (args.confirm !== 'ROLLBACK_PRODUCTION_TO_LEGACY_D1') {
  console.error('Refusing rollback without --confirm ROLLBACK_PRODUCTION_TO_LEGACY_D1')
  console.error(`Legacy target: ${LEGACY_DB_NAME} / ${LEGACY_DB_ID}`)
  console.error(`Previous deploy version: ${OLD_DEPLOY_VERSION_ID}`)
  console.error(`Normalized DB to preserve: ${NORMALIZED_DB_NAME} / ${NORMALIZED_DB_ID}`)
  process.exit(1)
}

const wrangler = readFileSync('wrangler.toml', 'utf8')
if (!wrangler.includes(`database_name = "${NORMALIZED_DB_NAME}"`) || !wrangler.includes(`database_id = "${NORMALIZED_DB_ID}"`)) {
  console.error('Current wrangler.toml does not point production at normalized D1; inspect manually before rollback.')
  process.exit(1)
}

console.error('This script validates rollback intent only. To rollback:')
console.error(`1. Stop daily update / keep normalized DB preserved.`)
console.error(`2. Change production NPB_DB to ${LEGACY_DB_NAME} / ${LEGACY_DB_ID}.`)
console.error('3. Run: wrangler deploy')
console.error('4. Smoke QA: Q-01 Q-17 Q-51 Q-61 Q-97 Q-98 Q-105 Q-109 Q-110')
console.error(`5. Re-cutover by restoring ${NORMALIZED_DB_NAME} / ${NORMALIZED_DB_ID} and deploying after full QA.`)

if (args.printOnly) {
  process.exit(0)
}

const result = spawnSync('git', ['diff', '--quiet', '--', 'wrangler.toml'], { stdio: 'inherit' })
if ((result.status ?? 1) !== 0) {
  console.error('wrangler.toml has uncommitted changes. Resolve before rollback.')
  process.exit(1)
}

function parseArgs(argv) {
  const parsed = { printOnly: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--confirm') parsed.confirm = argv[++i]
    else if (arg?.startsWith('--confirm=')) parsed.confirm = arg.slice('--confirm='.length)
    else if (arg === '--print-only') parsed.printOnly = true
    else {
      console.error(`Unknown argument: ${arg}`)
      process.exit(1)
    }
  }
  return parsed
}
