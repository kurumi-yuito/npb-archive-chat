import { describe, expect, it } from 'vitest'
import { canonicalPlayerFactCandidateSql } from './repository/player-identity-link'
import { openDatabase } from './sqlite'

describe('canonical player candidate prefilter', () => {
  it('does not interpret unrelated dictionary text as a LIKE pattern', () => {
    const db = openDatabase()
    try {
      db.exec(`
        CREATE TABLE player_profiles(player_id TEXT, canonical_name TEXT, full_name TEXT);
        CREATE TABLE player_aliases(player_id TEXT, alias TEXT);
        CREATE TABLE person_names(name_id INTEGER, name TEXT);
        CREATE TABLE facts(player_id TEXT, player_name_id INTEGER);
        INSERT INTO player_profiles VALUES ('target', '山川 穂高', '山川 穂高');
        INSERT INTO player_aliases VALUES ('target', '別名');
        INSERT INTO person_names VALUES (1, '山川'), (2, '山川 穂高'), (3, '別名'), (4, '別人');
        INSERT INTO facts VALUES (NULL, 1), (NULL, 2), (NULL, 3), (NULL, 4);
      `)
      db.prepare('INSERT INTO person_names VALUES (5, ?)').run('無関係'.repeat(20_000))
      const predicate = canonicalPlayerFactCandidateSql('facts.player_id', 'facts.player_name_id')
      const oldPredicate = predicate
        .replace('instr(candidate_identity.name, candidate_dictionary.name) = 1', "candidate_identity.name LIKE candidate_dictionary.name || '%'")
        .replace('instr(candidate_dictionary.name, candidate_identity.name) = 1', "candidate_dictionary.name LIKE candidate_identity.name || '%'")
      expect(() => db.prepare(`SELECT * FROM facts WHERE ${oldPredicate}`).all('target', 'target'))
        .toThrow('LIKE or GLOB pattern too complex')
      expect(db.prepare(`SELECT player_name_id FROM facts WHERE ${predicate} ORDER BY player_name_id`).all('target', 'target'))
        .toEqual([{ player_name_id: 1 }, { player_name_id: 2 }, { player_name_id: 3 }])
    } finally {
      db.close()
    }
  })
})
