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
  const workspaceTemplate = templateBlock(source, '<section class="workspace"', '\n  </main>')
  const conversationTemplate = templateBlock(source, '<div ref="conversationRef" class="conversation">', '\n      <!-- Composer -->')
  const workspaceCss = cssBlock(source, '.workspace')
  const shellCss = cssBlockContaining(source, '.chat-shell', 'height: 100%;')
  const topbarCss = cssBlock(source, '.topbar')
  const conversationCss = cssBlock(source, '.conversation')
  const composerCss = cssBlock(source, '.composer')

  it('keeps header, scroll area, and composer as separate workspace children', () => {
    expect(source).toMatch(/<header class="topbar">[\s\S]*<div ref="conversationRef" class="conversation">[\s\S]*<form class="composer"/u)
    expect(workspaceTemplate).toContain('<header class="topbar">')
    expect(workspaceTemplate).toContain('<div ref="conversationRef" class="conversation">')
    expect(workspaceTemplate).toContain('<form class="composer"')
    expect(workspaceTemplate.match(/<form class="composer"/gu)).toHaveLength(1)
    expect(conversationTemplate).not.toContain('<form class="composer"')
    expect(workspaceCss).toContain('display: flex;')
    expect(workspaceCss).toContain('flex-direction: column;')
    expect(workspaceCss).toContain('overflow: hidden;')
    expect(topbarCss).toContain('flex-shrink: 0;')
    expect(conversationCss).toContain('flex: 1 1 0;')
    expect(conversationCss).toContain('overflow-y: auto;')
    expect(composerCss).toContain('flex: 0 0 auto;')
    expect(composerCss).not.toMatch(/position:\s*(?:fixed|sticky);/u)
  })

  it('prevents body scrolling and uses dynamic viewport height', () => {
    expect(appSource).toMatch(/html,\s*body,\s*#__nuxt\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/u)
    expect(appSource).toMatch(/\.app-root\s*\{[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/u)
    expect(shellCss).toContain('height: 100%;')
    expect(shellCss).toContain('min-height: 0;')
    expect(shellCss).toContain('overflow: hidden;')
    expect(workspaceCss).toContain('height: 100%;')
    expect(workspaceCss).toContain('min-height: 0;')
    expect(workspaceCss).toContain('overflow: hidden;')
    expect(conversationCss).toContain('min-height: 0;')
    expect(conversationCss).not.toMatch(/(?:min-)?height:\s*100(?:d?vh|%);/u)
    expect(composerCss).toContain('padding-bottom: calc(0.6rem + env(safe-area-inset-bottom));')
    expect(source).not.toMatch(/\.composer\s*\{[\s\S]*margin:\s*0\.5rem 1\.25rem 1rem;/u)
    expect(source.match(/height:\s*100dvh;/gu) ?? []).toHaveLength(0)
    expect(nuxtConfigSource).toContain('interactive-widget=resizes-content')
  })

  it('scrolls the message area after answers and follow-up sends', () => {
    expect(source).toContain('conversationRef.value?.scrollTo({ top: conversationRef.value.scrollHeight, behavior })')
    expect(source).toMatch(/watch\(\s*\(\) => turns\.value\.map/u)
    expect(source).toContain('@click="submitText(question)"')
    expect(source).not.toMatch(/window\.scrollTo|window\.scrollY|document\.body\.scrollTop|document\.documentElement\.scrollTop/u)
  })

  it('labels a singular recent pitching result as appearance detail', () => {
    expect(source).toContain("q.filters.recent === true && q.filters.limit === 1 ? '登板内容' : '投手成績'")
  })
})

function templateBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endMarker, start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n}', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

function cssBlockContaining(source: string, selector: string, needle: string): string {
  const blockPattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{[\\s\\S]*?\\n\\}`, 'gu')
  const blocks = source.match(blockPattern) ?? []
  const block = blocks.find((candidate) => candidate.includes(needle))
  expect(block).toBeTruthy()
  return block ?? ''
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
