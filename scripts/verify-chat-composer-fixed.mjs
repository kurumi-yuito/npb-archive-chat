#!/usr/bin/env node

const cdpHost = process.env.CDP_HOST ?? 'http://127.0.0.1:9224'
const targetUrl = process.env.TARGET_URL ?? 'http://localhost:3000/chat'
const tolerancePx = Number(process.env.TOLERANCE_PX ?? '0.5')

const targets = await fetchJson(`${cdpHost}/json`)
const page = targets.find((target) => target.type === 'page')

if (!page?.webSocketDebuggerUrl) {
  throw new Error(`No Chrome page target found at ${cdpHost}`)
}

const client = await connectCdp(page.webSocketDebuggerUrl)

try {
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await client.send('Page.navigate', { url: targetUrl })
  await waitForExpression(client, 'document.querySelector(".conversation") && document.querySelector(".composer") && document.querySelector(".topbar")')

  const result = await client.send('Runtime.evaluate', {
    expression: measurementExpression(),
    awaitPromise: true,
    returnByValue: true,
  })
  const report = result.result.value
  console.log(JSON.stringify(report, null, 2))

  const failed = Object.entries(report.invariants)
    .filter(([, value]) => value !== true)
    .map(([key]) => key)

  if (failed.length > 0) {
    throw new Error(`Composer fixed-position verification failed: ${failed.join(', ')}`)
  }
} finally {
  client.close()
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`CDP fetch failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const pending = new Map()
    let nextId = 1

    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++
          socket.send(JSON.stringify({ id, method, params }))
          return new Promise((resolveCommand, rejectCommand) => {
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
          })
        },
        close() {
          socket.close()
        },
      })
    })

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !pending.has(message.id)) {
        return
      }
      const command = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) {
        command.reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`))
      } else {
        command.resolve(message.result)
      }
    })

    socket.addEventListener('error', () => {
      reject(new Error(`Failed to connect to Chrome DevTools at ${webSocketUrl}`))
    })
  })
}

async function waitForExpression(client, expression) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15_000) {
    const result = await client.send('Runtime.evaluate', {
      expression: `Boolean(${expression})`,
      returnByValue: true,
    })
    if (result.result.value === true) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}

function measurementExpression() {
  return `(async () => {
    const conversation = document.querySelector('.conversation')
    const composer = document.querySelector('.composer')
    const header = document.querySelector('.topbar')
    const workspace = document.querySelector('.workspace')
    const shell = document.querySelector('.chat-shell')

    if (!(conversation instanceof HTMLElement) || !(composer instanceof HTMLElement) || !(header instanceof HTMLElement) || !(workspace instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
      throw new Error('Required chat layout elements were not found')
    }

    const paragraphs = Array.from({ length: 90 }, (_, index) => (
      '<p>Composer fixed scroll verification paragraph ' + (index + 1) + ': game result, scoring, pitching, batting, and follow-up content.</p>'
    )).join('')

    conversation.innerHTML = [
      '<article class="turn">',
      '<div class="message message--user"><div class="bubble bubble--user">Show a long game detail answer</div></div>',
      '<div class="message message--assistant"><div class="answer">',
      '<p class="answer__summary">This long answer is used to verify that only the conversation area scrolls.</p>',
      '<div class="result-section"><h3 class="result-title">Game detail</h3>',
      paragraphs,
      '</div>',
      '<div class="result-section related-questions"><h3 class="result-title">Related questions</h3>',
      '<div class="related-questions__list">',
      '<button class="related-questions__item" type="button"><span>[]</span><span>Show every scoring play in this game</span></button>',
      '<button class="related-questions__item" type="button"><span>[]</span><span>Show the starting pitchers</span></button>',
      '<button class="related-questions__item" type="button"><span>[]</span><span>Show the game highlight</span></button>',
      '</div></div>',
      '</div></div></article>',
    ].join('')

    const round = (value) => Math.round(value * 100) / 100
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect()
      return {
        top: round(rect.top),
        bottom: round(rect.bottom),
        height: round(rect.height),
      }
    }
    const measure = (label) => ({
      label,
      windowScrollY: round(window.scrollY),
      bodyScrollTop: round(document.body.scrollTop),
      documentScrollTop: round(document.documentElement.scrollTop),
      shellScrollTop: round(shell.scrollTop),
      workspaceScrollTop: round(workspace.scrollTop),
      conversationScrollTop: round(conversation.scrollTop),
      conversationClientHeight: round(conversation.clientHeight),
      conversationScrollHeight: round(conversation.scrollHeight),
      composerOffsetTop: round(composer.offsetTop),
      composer: rectOf(composer),
      header: rectOf(header),
    })
    const stable = (a, b, key) => Math.abs(a[key] - b[key]) <= ${tolerancePx}
    const stableRect = (a, b) => (
      stable(a, b, 'top') &&
      stable(a, b, 'bottom') &&
      stable(a, b, 'height')
    )

    conversation.scrollTop = 0
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const before = measure('before')

    conversation.scrollTop = Math.min(800, conversation.scrollHeight - conversation.clientHeight)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const after800 = measure('after-800')

    conversation.scrollTop = Math.min(1600, conversation.scrollHeight - conversation.clientHeight)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const after1600 = measure('after-1600')

    return {
      targetViewport: { width: 390, height: 844 },
      composerParentClass: composer.parentElement?.className ?? null,
      conversationContainsComposer: conversation.contains(composer),
      before,
      after800,
      after1600,
      invariants: {
        composerOutsideConversation: !conversation.contains(composer),
        composerParentIsWorkspace: composer.parentElement === workspace,
        composerStableAfter800: stableRect(before.composer, after800.composer),
        composerStableAfter1600: stableRect(before.composer, after1600.composer),
        composerOffsetTopStableAfter1600: Math.abs(before.composerOffsetTop - after1600.composerOffsetTop) <= ${tolerancePx},
        headerStableAfter1600: stableRect(before.header, after1600.header),
        conversationScrolled: after800.conversationScrollTop > before.conversationScrollTop && after1600.conversationScrollTop > after800.conversationScrollTop,
        windowDidNotScroll: before.windowScrollY === 0 && after800.windowScrollY === 0 && after1600.windowScrollY === 0,
        bodyDidNotScroll: before.bodyScrollTop === 0 && after800.bodyScrollTop === 0 && after1600.bodyScrollTop === 0,
        documentDidNotScroll: before.documentScrollTop === 0 && after800.documentScrollTop === 0 && after1600.documentScrollTop === 0,
        shellDidNotScroll: before.shellScrollTop === 0 && after800.shellScrollTop === 0 && after1600.shellScrollTop === 0,
        workspaceDidNotScroll: before.workspaceScrollTop === 0 && after800.workspaceScrollTop === 0 && after1600.workspaceScrollTop === 0,
      },
    }
  })()`
}
