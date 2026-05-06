import { writeRichGameJson } from './index.ts'

async function main() {
  const [, , gameDir, outputPath] = process.argv

  if (!gameDir) {
    throw new Error(
      'Usage: node packages/parser/src/cli.ts <data/raw/{year}/{mmdd}/{game_id}> [output-json-path]',
    )
  }

  const writtenPath = await writeRichGameJson(gameDir, outputPath)
  process.stdout.write(`${writtenPath}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
