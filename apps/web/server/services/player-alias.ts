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
  return normalizeAliases([
    normalizedInput,
    ...displayNameFallbackAliases(normalizedInput),
  ])
}

export function normalizeAliases(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])]
}

export function resolveAlias(input: string): AliasResolution {
  const normalizedInput = normalizeFreeText(input) ?? input
  const fallbackAliases = displayNameFallbackAliases(normalizedInput)
  const aliases = normalizeAliases([
    normalizedInput,
    ...fallbackAliases,
  ])
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

function displayNameFallbackAliases(input: string): string[] {
  const normalized = normalizeLookupKey(input)
  if (!/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u.test(normalized)) {
    return []
  }
  if (normalized.length < 3) {
    return []
  }

  const aliases: string[] = []
  for (let length = normalized.length - 1; length >= 2; length -= 1) {
    aliases.push(normalized.slice(0, length))
  }
  return aliases
}

function normalizeLookupKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[・･.\-_\s\u3000]/gu, '')
    .toLowerCase()
}
