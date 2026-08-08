import { normalizeFreeText } from './chat-query-normalizer'

export type AliasResolutionStatus = 'resolved' | 'empty'

export type AliasResolutionMetadata = {
  input: string
  normalizedInput: string
  aliases: string[]
  fallbackAliases: string[]
  status: AliasResolutionStatus
}

export type AliasResolution = {
  aliases: string[]
  metadata: AliasResolutionMetadata
}

export function buildAliases(input: string): string[] {
  const normalizedInput = normalizeFreeText(input) ?? input
  return normalizeAliases([normalizedInput])
}

export function normalizeAliases(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

export function resolveAlias(input: string): AliasResolution {
  const normalizedInput = normalizeFreeText(input) ?? input
  const fallbackAliases: string[] = []
  const aliases = normalizeAliases([normalizedInput])
  return {
    aliases,
    metadata: {
      input,
      normalizedInput,
      aliases,
      fallbackAliases,
      status: aliases.length > 0 ? 'resolved' : 'empty',
    },
  }
}
