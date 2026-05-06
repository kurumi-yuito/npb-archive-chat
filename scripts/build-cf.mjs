/**
 * Cloudflare Workers 向け Nitro ビルド（NITRO_PRESET=cloudflare_module）。
 * ローカル既定の node-server ビルドは `pnpm build` のまま。
 */
import { spawnSync } from 'node:child_process'
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

process.exit(result.status ?? 1)
