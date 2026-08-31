import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const acceptance = readFileSync(
  path.join(root, 'docs/qa-blackbox-usecase-test-20260828.md'),
  'utf8',
)
const operationRules = readFileSync(
  path.join(root, 'docs/ai-operation-rules.md'),
  'utf8',
)

describe('black-box Acceptance Test governance', () => {
  it('keeps the official suite at 47 individually evaluated turns', () => {
    const singleCases = acceptance.match(/^### B\d{2}$/gmu) ?? []
    const multiTurnQuestions = acceptance.match(/^\*\*Turn\d+ 質問\*\*/gmu) ?? []

    expect(singleCases).toHaveLength(33)
    expect(multiTurnQuestions).toHaveLength(14)
    expect(singleCases.length + multiTurnQuestions.length).toBe(47)
  })

  it('classifies all 43 initial failures into exactly one owner', () => {
    expect(acceptance).toContain(
      'Planner 27、Entity Resolution 12、Repository 3、Formatter 0、QA仕様 1、合計43件',
    )
  })

  it('does not allow regression-only success to become Release Ready', () => {
    expect(operationRules).toContain(
      '182件だけのPassをRelease Readyとしてはいけない',
    )
    expect(operationRules).toContain(
      '47件Acceptance Testが全件Pass',
    )
  })
})
