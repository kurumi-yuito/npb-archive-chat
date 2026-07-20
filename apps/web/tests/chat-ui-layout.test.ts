import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CHAT_PAGE_SOURCE = path.resolve(process.cwd(), 'apps/web/pages/chat.vue')
const APP_SOURCE = path.resolve(process.cwd(), 'apps/web/app.vue')
const NUXT_CONFIG_SOURCE = path.resolve(process.cwd(), 'apps/web/nuxt.config.ts')

describe('chat UI layout', () => {
  const source = readFileSync(CHAT_PAGE_SOURCE, 'utf8')
  const appSource = readFileSync(APP_SOURCE, 'utf8')
  const nuxtConfigSource = readFileSync(NUXT_CONFIG_SOURCE, 'utf8')
  const composerCss = cssBlock(source, '.composer')

  it('keeps header, scroll area, and composer as separate workspace children', () => {
    expect(source).toMatch(/<header class="topbar">[\s\S]*<div ref="conversationRef" class="conversation">[\s\S]*<form class="composer"/u)
    expect(source).toMatch(/\.workspace\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;/u)
    expect(source).toMatch(/\.topbar\s*\{[\s\S]*flex-shrink:\s*0;/u)
    expect(source).toMatch(/\.conversation\s*\{[\s\S]*flex:\s*1 1 0;[\s\S]*overflow-y:\s*auto;/u)
    expect(composerCss).toContain('flex: 0 0 auto;')
    expect(composerCss).not.toMatch(/position:\s*(?:fixed|sticky);/u)
  })

  it('prevents body scrolling and uses dynamic viewport height', () => {
    expect(appSource).toMatch(/html,\s*body,\s*#__nuxt\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/u)
    expect(appSource).toMatch(/\.app-root\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/u)
    expect(source).toMatch(/height:\s*100dvh;/u)
    expect(source).toMatch(/min-height:\s*0;/u)
    expect(source).toMatch(/\.conversation\s*\{[\s\S]*min-height:\s*0;/u)
    expect(source).toMatch(/padding-bottom:\s*calc\(0\.6rem \+ env\(safe-area-inset-bottom\)\);/u)
    expect(source).not.toMatch(/\.composer\s*\{[\s\S]*margin:\s*0\.5rem 1\.25rem 1rem;/u)
    expect(nuxtConfigSource).toContain('interactive-widget=resizes-content')
  })

  it('scrolls the message area after answers and follow-up sends', () => {
    expect(source).toContain('conversationRef.value?.scrollTo({ top: conversationRef.value.scrollHeight, behavior })')
    expect(source).toMatch(/watch\(\s*\(\) => turns\.value\.map/u)
    expect(source).toContain('@click="submitText(question)"')
    expect(source).not.toMatch(/window\.scrollTo|document\.body\.scrollTop/u)
  })
})

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n}', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}
