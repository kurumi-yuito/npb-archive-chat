/** Comparison key only. Equal names never merge distinct official player IDs. */
export function normalizePlayerNameKey(value: string): string {
  return value.normalize('NFKC').replace(/﨑/gu, '崎').replace(/髙/gu, '高').replace(/濵/gu, '浜')
    .replace(/[*＊+＋・･.\-_\s\u3000]/gu, '').toLowerCase()
}
