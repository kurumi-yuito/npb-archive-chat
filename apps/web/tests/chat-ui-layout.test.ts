import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CHAT_PAGE_SOURCE = path.resolve(process.cwd(), 'apps/web/pages/chat.vue')

describe('chat UI layout', () => {
  const source = readFileSync(CHAT_PAGE_SOURCE, 'utf8')

  it('keeps the composer fixed at the bottom of the workspace', () => {
    expect(source).toMatch(/<header class="topbar">[\s\S]*<div ref="conversationRef" class="conversation">[\s\S]*<form class="composer"/u)
    expect(source).toMatch(/\.workspace\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;/u)
    expect(source).toMatch(/\.conversation\s*\{[\s\S]*flex:\s*1 1 0;[\s\S]*overflow-y:\s*auto;/u)
    expect(source).toMatch(/\.composer\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;[\s\S]*z-index:\s*5;/u)
  })

  it('uses dynamic viewport height and safe-area padding for mobile keyboards', () => {
    expect(source).toMatch(/height:\s*100dvh;/u)
    expect(source).toMatch(/padding-bottom:\s*calc\(0\.6rem \+ env\(safe-area-inset-bottom\)\);/u)
    expect(source).not.toMatch(/\.composer\s*\{[\s\S]*margin:\s*0\.5rem 1\.25rem 1rem;/u)
  })

  it('scrolls the message area after answers and follow-up sends', () => {
    expect(source).toContain('conversationRef.value?.scrollTo({ top: conversationRef.value.scrollHeight, behavior })')
    expect(source).toMatch(/watch\(\s*\(\) => turns\.value\.map/u)
    expect(source).toContain('@click="submitText(question)"')
  })
})
