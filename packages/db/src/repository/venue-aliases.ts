const venueAliases = new Map<string, string[]>([
  ['東京ドーム', ['東京ドーム', 'Tokyo Dome']],
  ['Tokyo Dome', ['Tokyo Dome', '東京ドーム']],
  ['甲子園', ['甲子園', 'Koshien']],
  ['Koshien', ['Koshien', '甲子園']],
])

export function venueSearchValues(venue: string): string[] {
  const aliases = venueAliases.get(venue) ?? [venue]
  return Array.from(new Set(aliases))
}
