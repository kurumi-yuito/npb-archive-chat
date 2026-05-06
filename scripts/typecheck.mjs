import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, shell: false })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('node', [
  join(root, 'apps/web/node_modules/vue-tsc/bin/vue-tsc.js'),
  '--noEmit',
  '-p',
  join(root, 'apps/web/tsconfig.json'),
])

for (const pkg of ['schemas', 'crawler', 'parser', 'db']) {
  run('node', [
    join(root, `packages/${pkg}/node_modules/typescript/lib/tsc.js`),
    '-p',
    join(root, `packages/${pkg}/tsconfig.json`),
    '--noEmit',
  ])
}
