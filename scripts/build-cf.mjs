/**
 * Cloudflare Workers 向け Nitro ビルド（NITRO_PRESET=cloudflare_module）。
 * ローカル既定の node-server ビルドは `pnpm build` のまま。
 */
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.NITRO_PRESET = 'cloudflare_module'

const nuxt = path.join(root, 'apps', 'web', 'node_modules', 'nuxt', 'bin', 'nuxt.mjs')
const result = spawnSync(process.execPath, [nuxt, 'build', 'apps/web'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

stripWranglerIgnoredBareProcessImports(path.join(root, 'apps', 'web', '.output', 'server'))

function stripWranglerIgnoredBareProcessImports(dir) {
  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      stripWranglerIgnoredBareProcessImports(filePath)
      continue
    }
    if (!entry.endsWith('.mjs')) continue

    const source = readFileSync(filePath, 'utf8')
    const next = source.replaceAll('import"node:process";', '')
    if (next !== source) {
      writeFileSync(filePath, next)
    }
  }
}
