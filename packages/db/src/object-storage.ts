import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type StorageMode = 'local' | 'r2'

export type ObjectStorageOptions = {
  mode?: StorageMode
  workspaceRoot: string
  bucket?: string
  prefix?: string
  endpoint?: string
}

export type ObjectStorage = {
  mode: StorageMode
  localPath(key: string): string
  getText(key: string): Promise<string | null>
  putText(key: string, value: string, contentType?: string): Promise<string>
  putLocalFile(key: string, filePath: string, contentType?: string): Promise<string>
}

export type StorageArgs = {
  storage?: StorageMode
  r2Bucket?: string
  r2Prefix?: string
  r2Endpoint?: string
}

export type R2SyncOptions = {
  workspaceRoot: string
  bucket?: string
  prefix?: string
  endpoint?: string
}

export function parseStorageArg(
  arg: string | undefined,
  next: () => string | undefined,
  target: StorageArgs,
): boolean {
  if (arg === '--storage') {
    target.storage = parseStorageMode(next())
    return true
  }
  if (arg?.startsWith('--storage=')) {
    target.storage = parseStorageMode(arg.slice('--storage='.length))
    return true
  }
  if (arg === '--r2-bucket') {
    target.r2Bucket = next()
    return true
  }
  if (arg?.startsWith('--r2-bucket=')) {
    target.r2Bucket = arg.slice('--r2-bucket='.length)
    return true
  }
  if (arg === '--r2-prefix') {
    target.r2Prefix = next() ?? ''
    return true
  }
  if (arg?.startsWith('--r2-prefix=')) {
    target.r2Prefix = arg.slice('--r2-prefix='.length)
    return true
  }
  if (arg === '--r2-endpoint') {
    target.r2Endpoint = next()
    return true
  }
  if (arg?.startsWith('--r2-endpoint=')) {
    target.r2Endpoint = arg.slice('--r2-endpoint='.length)
    return true
  }
  return false
}

export function createObjectStorage(options: ObjectStorageOptions): ObjectStorage {
  const mode = options.mode ?? 'local'
  const prefix = normalizePrefix(options.prefix ?? '')
  const endpoint = options.endpoint ?? defaultR2Endpoint()

  return {
    mode,
    localPath(key: string) {
      return path.join(options.workspaceRoot, 'data', normalizeKey(key))
    },
    async getText(key: string) {
      const normalized = normalizeKey(key)
      const localPath = path.join(options.workspaceRoot, 'data', normalized)
      try {
        const local = await readFile(localPath, 'utf8')
        if (local.trim()) {
          return local
        }
      } catch {
        // R2 fallback below.
      }
      if (mode !== 'r2') {
        return null
      }
      const text = r2ReadText(requireBucket(options.bucket), objectKey(prefix, normalized), endpoint)
      if (text === null || !text.trim()) {
        return null
      }
      await writeLocal(localPath, text)
      return text
    },
    async putText(key: string, value: string, contentType = 'text/plain; charset=utf-8') {
      const normalized = normalizeKey(key)
      const localPath = path.join(options.workspaceRoot, 'data', normalized)
      await writeLocal(localPath, value)
      if (mode === 'r2') {
        r2WriteText(requireBucket(options.bucket), objectKey(prefix, normalized), value, endpoint, contentType)
      }
      return localPath
    },
    async putLocalFile(key: string, filePath: string, contentType = 'application/octet-stream') {
      const normalized = normalizeKey(key)
      if (mode === 'r2') {
        r2WriteFile(requireBucket(options.bucket), objectKey(prefix, normalized), filePath, endpoint, contentType)
      }
      return filePath
    },
  }
}

export function defaultR2Bucket(): string | undefined {
  return process.env.NPB_R2_BUCKET || process.env.NPB_R2_RAW_BUCKET
}

export function syncR2PrefixToLocal(options: R2SyncOptions, prefix: string): void {
  const bucket = requireBucket(options.bucket ?? defaultR2Bucket())
  const normalizedPrefix = objectKey(normalizePrefix(options.prefix ?? ''), normalizeKey(prefix))
  const localDirectory = path.join(options.workspaceRoot, 'data', normalizeKey(prefix))
  const result = runAws([
    's3',
    'sync',
    `s3://${bucket}/${normalizedPrefix}`,
    localDirectory,
    ...endpointArgs(options.endpoint ?? defaultR2Endpoint()),
    '--only-show-errors',
  ])
  if (result.status !== 0) {
    throw new Error(`R2 sync failed: s3://${bucket}/${normalizedPrefix}\n${result.stderr}`)
  }
}

function parseStorageMode(value: string | undefined): StorageMode {
  if (value === 'local' || value === 'r2') {
    return value
  }
  throw new Error(`Invalid storage mode: ${value ?? '(missing)'}`)
}

function defaultR2Endpoint(): string | undefined {
  if (process.env.NPB_R2_ENDPOINT) {
    return process.env.NPB_R2_ENDPOINT
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID) {
    return `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
  }
  return undefined
}

function requireBucket(bucket: string | undefined): string {
  if (!bucket) {
    throw new Error('R2 bucket is required. Pass --r2-bucket or set NPB_R2_BUCKET.')
  }
  return bucket
}

function normalizeKey(key: string): string {
  return key.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^data\//, '')
}

function normalizePrefix(prefix: string): string {
  return prefix.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

function objectKey(prefix: string, key: string): string {
  return prefix ? `${prefix}/${key}` : key
}

async function writeLocal(filePath: string, value: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, value, 'utf8')
}

function r2ReadText(bucket: string, key: string, endpoint: string | undefined): string | null {
  const result = runAws(['s3', 'cp', `s3://${bucket}/${key}`, '-', ...endpointArgs(endpoint)])
  if (result.status !== 0) {
    return null
  }
  return result.stdout
}

function r2WriteText(
  bucket: string,
  key: string,
  value: string,
  endpoint: string | undefined,
  contentType: string,
): void {
  const result = runAws(
    ['s3', 'cp', '-', `s3://${bucket}/${key}`, '--content-type', contentType, ...endpointArgs(endpoint), '--only-show-errors'],
    value,
  )
  if (result.status !== 0) {
    throw new Error(`R2 write failed: s3://${bucket}/${key}\n${result.stderr}`)
  }
}

function r2WriteFile(
  bucket: string,
  key: string,
  filePath: string,
  endpoint: string | undefined,
  contentType: string,
): void {
  const result = runAws(
    ['s3', 'cp', filePath, `s3://${bucket}/${key}`, '--content-type', contentType, ...endpointArgs(endpoint), '--only-show-errors'],
  )
  if (result.status !== 0) {
    throw new Error(`R2 write failed: s3://${bucket}/${key}\n${result.stderr}`)
  }
}

function endpointArgs(endpoint: string | undefined): string[] {
  return endpoint ? ['--endpoint-url', endpoint] : []
}

function runAws(args: string[], input?: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('aws', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 128,
  })
  if (result.error) {
    throw new Error(`aws command failed: ${result.error.message}`)
  }
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}
