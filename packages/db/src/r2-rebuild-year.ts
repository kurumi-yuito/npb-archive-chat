import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { findWorkspaceRoot } from '@npb/crawler'
import { parseRawGameFromDir } from '@npb/parser'
import { loadRichGame, loadStructuredGameDirectory } from './loader'
import { loadBisCurrentDataset } from './bis-current'
import { migrateDatabase } from './migrations'
import { defaultR2Bucket, parseStorageArg, syncR2PrefixToLocal, type StorageArgs } from './object-storage'
import { openDatabase } from './sqlite'

export type RebuildYearFromR2Args = StorageArgs & {
  year: number
  sqlitePath: string
  workspaceRoot?: string
  clean?: boolean
}

export type RebuildYearFromR2Result = {
  year: number
  sqlitePath: string
  loadedStructuredGames: number
  loadedRawGames: number
  loadedBisCurrent: boolean
}

export function parseRebuildYearFromR2Args(argv: string[]): RebuildYearFromR2Args {
  const args = [...argv]
  while (args[0] === '--') {
    args.shift()
  }
  let year: number | undefined
  let sqlitePath: string | undefined
  let workspaceRoot: string | undefined
  let clean = false
  const storageArgs: StorageArgs = {}

  while (args.length > 0) {
    const arg = args.shift()
    if (parseStorageArg(arg, () => args.shift(), storageArgs)) {
      continue
    }
    if (arg === '--year') {
      year = parsePositiveInteger(args.shift(), 'year')
      continue
    }
    if (arg?.startsWith('--year=')) {
      year = parsePositiveInteger(arg.slice('--year='.length), 'year')
      continue
    }
    if (arg === '--sqlite-path') {
      sqlitePath = args.shift()
      continue
    }
    if (arg?.startsWith('--sqlite-path=')) {
      sqlitePath = arg.slice('--sqlite-path='.length)
      continue
    }
    if (arg === '--workspace-root') {
      workspaceRoot = args.shift()
      continue
    }
    if (arg?.startsWith('--workspace-root=')) {
      workspaceRoot = arg.slice('--workspace-root='.length)
      continue
    }
    if (arg === '--clean') {
      clean = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!year) {
    throw new Error('Missing required argument: --year')
  }
  if (!sqlitePath) {
    throw new Error('Missing required argument: --sqlite-path')
  }
  return { year, sqlitePath, workspaceRoot, clean, ...storageArgs }
}

export async function rebuildYearFromR2(options: RebuildYearFromR2Args): Promise<RebuildYearFromR2Result> {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? (await findWorkspaceRoot(process.cwd())))
  const sqlitePath = path.resolve(workspaceRoot, options.sqlitePath)
  if (options.clean) {
    await rm(sqlitePath, { force: true })
  }

  syncR2PrefixToLocal(
    {
      workspaceRoot,
      bucket: options.r2Bucket ?? defaultR2Bucket(),
      prefix: options.r2Prefix,
      endpoint: options.r2Endpoint,
    },
    `structured/${options.year}`,
  )
  syncR2PrefixToLocal(
    {
      workspaceRoot,
      bucket: options.r2Bucket ?? defaultR2Bucket(),
      prefix: options.r2Prefix,
      endpoint: options.r2Endpoint,
    },
    `structured/bis/${options.year}`,
  )
  syncR2PrefixToLocal(
    {
      workspaceRoot,
      bucket: options.r2Bucket ?? defaultR2Bucket(),
      prefix: options.r2Prefix,
      endpoint: options.r2Endpoint,
    },
    `raw/${options.year}`,
  )

  const database = openDatabase(sqlitePath)
  let loadedStructuredGames = 0
  let loadedRawGames = 0
  let loadedBisCurrent = false

  try {
    migrateDatabase(database)

    for (const structuredDir of await listStructuredGameDirs(workspaceRoot, options.year)) {
      await loadStructuredGameDirectory(database, structuredDir)
      loadedStructuredGames += 1
    }

    const bisPath = path.join(workspaceRoot, 'data', 'structured', 'bis', String(options.year), 'bis-current.json')
    try {
      const dataset = JSON.parse(await readFile(bisPath, 'utf8'))
      loadBisCurrentDataset(database, dataset)
      loadedBisCurrent = true
    } catch {
      loadedBisCurrent = false
    }

    const structuredGameIds = new Set(
      (await listStructuredGameDirs(workspaceRoot, options.year)).map((dir) => path.basename(dir)),
    )
    for (const rawDir of await listRawGameDirs(workspaceRoot, options.year)) {
      if (structuredGameIds.has(path.basename(rawDir))) {
        continue
      }
      const richGame = await parseRawGameFromDir(rawDir)
      loadRichGame(database, richGame)
      loadedRawGames += 1
    }
  } finally {
    database.close()
  }

  return {
    year: options.year,
    sqlitePath,
    loadedStructuredGames,
    loadedRawGames,
    loadedBisCurrent,
  }
}

async function listStructuredGameDirs(workspaceRoot: string, year: number): Promise<string[]> {
  const root = path.join(workspaceRoot, 'data', 'structured', String(year))
  return listGameDirs(root)
}

async function listRawGameDirs(workspaceRoot: string, year: number): Promise<string[]> {
  const root = path.join(workspaceRoot, 'data', 'raw', String(year))
  return listGameDirs(root)
}

async function listGameDirs(root: string): Promise<string[]> {
  const result: string[] = []
  let monthEntries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    monthEntries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  for (const monthEntry of monthEntries) {
    if (!monthEntry.isDirectory()) {
      continue
    }
    const monthDir = path.join(root, monthEntry.name)
    const gameEntries = await readdir(monthDir, { withFileTypes: true })
    for (const gameEntry of gameEntries) {
      if (gameEntry.isDirectory()) {
        result.push(path.join(monthDir, gameEntry.name))
      }
    }
  }
  return result
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value ?? '(missing)'}`)
  }
  return Number.parseInt(value, 10)
}
