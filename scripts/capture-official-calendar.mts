import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { openDatabase } from '../packages/db/src/sqlite'
import { createObjectStorage } from '../packages/db/src/object-storage'
import { captureOfficialCalendar } from '../packages/db/src/official-calendar-capture'
import { storeOfficialCalendarCapture } from '../packages/db/src/official-calendar'

const [directory, ...scopes] = process.argv.slice(2)
if (!directory || !scopes.length) throw new Error('Usage requires a staging directory and YYYY or YYYY-MM scopes')
await mkdir(directory, { recursive: true })
const database = openDatabase(path.join(directory, 'calendar.sqlite'))
database.exec(await readFile(new URL('../packages/db/migrations/0016_official_calendar.sql', import.meta.url), 'utf8'))
const storage = createObjectStorage({ mode: 'local', workspaceRoot: directory })
const observations = []
try {
  for (const scope of scopes) {
    const match = /^(\d{4})(?:-(\d{2}))?$/u.exec(scope)
    if (!match) throw new Error('Invalid calendar scope')
    const capture = await captureOfficialCalendar(Number(match[1]), match[2] ? Number(match[2]) : undefined)
    const observation = await storeOfficialCalendarCapture(database, storage, capture)
    observations.push(observation)
    console.log(JSON.stringify({ scope, observationId: observation.observationId, sourceUrl: observation.sourceUrl }))
  }
  await writeFile(path.join(directory, 'capture-receipt.json'), JSON.stringify({ environment: 'isolated_source_capture', observations }, null, 2) + '\n')
} finally {
  database.close()
}
