import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createDownloadLogger,
  discoverGamesByYear,
  downloadDiscoveredGames,
  findWorkspaceRoot,
  parseDiscoverArgs,
  parseDownloadArgs,
} from './index.ts'

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const workspaceRoot = await findWorkspaceRoot(process.cwd())

  if (command === 'discover') {
    const { year } = parseDiscoverArgs(rest)
    const discovery = await discoverGamesByYear({ year })
    const outputDir = resolve(workspaceRoot, 'data', 'discovery')
    const outputPath = resolve(outputDir, `${year}.json`)

    await mkdir(outputDir, { recursive: true })
    await writeFile(outputPath, `${JSON.stringify(discovery, null, 2)}\n`, 'utf8')
    process.stdout.write(`${outputPath}\n`)
    return
  }

  if (command === 'download') {
    const args = parseDownloadArgs(rest)
    const logger = await createDownloadLogger(
      resolve(workspaceRoot, 'data', 'logs', 'download.log'),
    )
    const result = await downloadDiscoveredGames({
      ...args,
      workspaceRoot,
      logger,
    })
    const downloadedPages = result.games.flatMap((game) => game.pages)
    const downloadedCount = downloadedPages.filter(
      (page) => page.status === 'downloaded',
    ).length
    const skippedCount = downloadedPages.filter(
      (page) => page.status === 'skipped',
    ).length

    process.stdout.write(
      `${resolve(workspaceRoot, 'data', 'raw')} downloaded=${downloadedCount} skipped=${skippedCount}\n`,
    )
    return
  }

  throw new Error(`Unknown command: ${command ?? '(missing)'}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
