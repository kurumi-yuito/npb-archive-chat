export function capture(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[1] ?? null
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

export function cleanText(value: string | null | undefined): string {
  return decodeHtmlEntities(String(value ?? ''))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = cleanText(value)
  return normalized.length > 0 ? normalized : null
}

export function normalizeNumber(value: string | null | undefined): number | null {
  const normalized = cleanText(value)
  if (!normalized) {
    return null
  }
  const digits = normalized.replaceAll(',', '')
  return /^-?\d+$/.test(digits) ? Number(digits) : null
}

export function absoluteUrl(url: string): string {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return url.replace(/^http:\/\//i, 'https://')
  }
  if (url.startsWith('//')) {
    return `https:${url}`
  }
  if (url.startsWith('/')) {
    return `https://npb.jp${url}`
  }
  return `https://npb.jp/${url.replace(/^\.?\//, '')}`
}

export function extractTopLevelElements(html: string, tagName: string): string[] {
  const matcher = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi')
  const results: string[] = []
  let start = -1
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = matcher.exec(html)) !== null) {
    const isClosing = match[1] === '/'
    if (!isClosing) {
      if (depth === 0) {
        start = match.index
      }
      depth += 1
      continue
    }

    depth -= 1
    if (depth === 0 && start >= 0) {
      results.push(html.slice(start, matcher.lastIndex))
      start = -1
    }
  }

  return results
}

export function extractTopLevelCells(rowHtml: string): string[] {
  const matcher = /<(\/?)(td|th)\b[^>]*>/gi
  const results: string[] = []
  let start = -1
  let depth = 0
  let match: RegExpExecArray | null

  while ((match = matcher.exec(rowHtml)) !== null) {
    const isClosing = match[1] === '/'
    if (!isClosing) {
      if (depth === 0) {
        start = match.index
      }
      depth += 1
      continue
    }

    depth -= 1
    if (depth === 0 && start >= 0) {
      results.push(rowHtml.slice(start, matcher.lastIndex))
      start = -1
    }
  }

  return results
}

export function extractInnerHtml(cellHtml: string): string {
  return cellHtml.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '')
}

export function parseLinks(html: string): Array<{ name: string; url: string | null }> {
  return [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    name: cleanText(stripTags(match[2] ?? '')),
    url: absoluteUrl(match[1] ?? ''),
  }))
}

export function parseCell(cellHtml: string): {
  text: string
  classes: string[]
  links: Array<{ name: string; url: string | null }>
  rawText: string
  rawHtml: string
} {
  const classAttr = cellHtml.match(/class=["']([^"']+)["']/i)?.[1] ?? ''
  const classes = classAttr
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
  const rawHtml = extractInnerHtml(cellHtml)
  const rawText = stripTags(rawHtml)
  return {
    text: cleanText(rawText),
    classes,
    links: parseLinks(rawHtml),
    rawText: cleanText(rawText),
    rawHtml,
  }
}

export function inferSourceUrlFromCanonical(html: string, fallbackSuffix = ''): string | null {
  const canonical =
    capture(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
    capture(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
  if (!canonical) {
    return null
  }
  if (!fallbackSuffix) {
    return absoluteUrl(canonical)
  }
  const normalized = absoluteUrl(canonical)
  return normalized.endsWith(fallbackSuffix) ? normalized : `${normalized.replace(/\/+$/u, '')}/${fallbackSuffix}`
}

export function countRunsScored(text: string): number | null {
  const normalized = cleanText(text)
  if (!normalized) {
    return null
  }
  const explicit = normalized.match(/([0-9０-９]+)点/)
  if (explicit) {
    return toAsciiNumber(explicit[1])
  }
  const count = (normalized.match(/生還/g) ?? []).length
  return count > 0 ? count : null
}

export function toAsciiNumber(value: string): number | null {
  const normalized = [...value]
    .map((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 0xff10 && code <= 0xff19 ? String(code - 0xff10) : ch
    })
    .join('')
  return /^\d+$/.test(normalized) ? Number(normalized) : null
}
