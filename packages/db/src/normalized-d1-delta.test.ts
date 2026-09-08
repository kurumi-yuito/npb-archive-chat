import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildNormalizedDelta, readSyncGeneration } from './normalized-d1-delta'
import { openDatabase, withTransaction } from './sqlite'

const schema = `CREATE TABLE teams(team_id INTEGER PRIMARY KEY,team_name TEXT UNIQUE);
CREATE TABLE game_facts(game_id TEXT PRIMARY KEY,team_id INTEGER REFERENCES teams(team_id),score INTEGER);
INSERT INTO teams VALUES(1,'B'); INSERT INTO game_facts VALUES('one',1,1);`
const tables = ['teams', 'game_facts']

describe('atomic normalized publication', () => {
  it('keeps unchanged historical facts when conversion renumbers dictionaries', () => {
    const previous = openDatabase(); const next = openDatabase()
    try {
      previous.exec(schema); next.exec(schema)
      next.exec("DELETE FROM game_facts; DELETE FROM teams; INSERT INTO teams VALUES(1,'A'),(2,'B'); INSERT INTO game_facts VALUES('one',2,1)")
      const delta = buildNormalizedDelta(previous, next, tables)
      expect(delta.changes.game_facts).toEqual({ inserted: 0, updated: 0, deleted: 0 })
      withTransaction(previous, () => previous.exec(delta.sql))
      expect(previous.prepare('SELECT * FROM game_facts').get()).toEqual({ game_id: 'one', team_id: 1, score: 1 })
      expect(previous.prepare("SELECT team_id FROM teams WHERE team_name='A'").get()).toEqual({ team_id: 2 })
    } finally { previous.close(); next.close() }
  })

  it('exposes only the old or completed version to a separate reader', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'npb-atomic-'))
    const writer = openDatabase(path.join(dir, 'db.sqlite')); const next = openDatabase()
    let reader: ReturnType<typeof openDatabase> | undefined
    try {
      writer.exec(schema); next.exec(schema)
      next.exec("UPDATE game_facts SET score=2; INSERT INTO game_facts VALUES('two',1,3)")
      reader = openDatabase(path.join(dir, 'db.sqlite'))
      const delta = buildNormalizedDelta(writer, next, tables)
      writer.exec('BEGIN')
      writer.exec(delta.sql)
      expect(reader.prepare('SELECT score FROM game_facts ORDER BY game_id').all()).toEqual([{ score: 1 }])
      writer.exec('COMMIT')
      expect(reader.prepare('SELECT score FROM game_facts ORDER BY game_id').all()).toEqual([{ score: 2 }, { score: 3 }])
      expect(readSyncGeneration(reader)).toBe(delta.generation)
    } finally { reader?.close(); writer.close(); next.close(); rmSync(dir, { recursive: true, force: true }) }
  })

  it('rolls back every change on a late failure and rejects stale publication', () => {
    const previous = openDatabase(); const next = openDatabase()
    try {
      previous.exec(schema); next.exec(schema); next.exec('UPDATE game_facts SET score=2')
      const delta = buildNormalizedDelta(previous, next, tables)
      expect(() => withTransaction(previous, () => previous.exec(delta.sql + '\nINSERT INTO missing_table VALUES(1);'))).toThrow()
      expect(readSyncGeneration(previous)).toBe('legacy')
      expect(previous.prepare('SELECT score FROM game_facts').get()).toEqual({ score: 1 })
      withTransaction(previous, () => previous.exec(delta.sql))
      expect(() => withTransaction(previous, () => previous.exec(delta.sql))).toThrow()
      expect(readSyncGeneration(previous)).toBe(delta.generation)
    } finally { previous.close(); next.close() }
  })

  it('rejects external changes rather than overwriting a newer row', () => {
    const previous = openDatabase(); const next = openDatabase()
    try {
      previous.exec(schema); next.exec(schema); next.exec('UPDATE game_facts SET score=2')
      const delta = buildNormalizedDelta(previous, next, tables)
      previous.exec('UPDATE game_facts SET score=9')
      expect(() => withTransaction(previous, () => previous.exec(delta.sql))).toThrow()
      expect(previous.prepare('SELECT score FROM game_facts').get()).toEqual({ score: 9 })
    } finally { previous.close(); next.close() }
  })

  it('updates parents without REPLACE cascades and deletes only absent rows', () => {
    const previous = openDatabase(); const next = openDatabase()
    const fixture = `CREATE TABLE parents(id TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE children(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES parents(id) ON DELETE CASCADE);
      INSERT INTO parents VALUES('keep','old'),('remove','old');
      INSERT INTO children VALUES('keep-child','keep'),('remove-child','remove');`
    try {
      previous.exec(fixture); next.exec(fixture)
      next.exec("UPDATE parents SET value='new' WHERE id='keep'; DELETE FROM parents WHERE id='remove'")
      const delta = buildNormalizedDelta(previous, next, ['parents', 'children'])
      withTransaction(previous, () => previous.exec(delta.sql))
      expect(previous.prepare('SELECT * FROM children').all()).toEqual([{ id: 'keep-child', parent_id: 'keep' }])
      expect(previous.prepare('SELECT * FROM parents').all()).toEqual([{ id: 'keep', value: 'new' }])
      expect(delta.sql).not.toContain('REPLACE')
    } finally { previous.close(); next.close() }
  })
})
