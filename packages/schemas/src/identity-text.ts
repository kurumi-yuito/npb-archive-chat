/** Comparison key only. Equal names never merge distinct official player IDs. */
export function normalizePlayerNameKey(value: string): string {
  return value.normalize('NFKC').replace(/﨑/gu, '崎').replace(/髙/gu, '高').replace(/濵/gu, '浜')
    .replace(/[*＊+＋・･.\-_\s\u3000]/gu, '').toLowerCase()
}

/** Candidate keys, never an identity decision. An official Latin initial may
 * be omitted by another official source; year/team uniqueness is still needed. */
export function officialPlayerNameCandidateKeys(value: string): string[] {
  const withoutInitials = value.normalize('NFKC').replace(/^(?:[A-Z]{1,3}\.\s*)+/iu, '')
  return [...new Set([normalizePlayerNameKey(value), normalizePlayerNameKey(withoutInitials)])]
}
