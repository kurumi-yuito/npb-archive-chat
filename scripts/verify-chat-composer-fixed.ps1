param(
  [string] $CdpHost = "http://127.0.0.1:9224",
  [string] $TargetUrl = "http://localhost:3000/chat",
  [double] $TolerancePx = 0.5
)

$ErrorActionPreference = "Stop"

$targets = Invoke-RestMethod -Uri "$CdpHost/json"
$page = @($targets | Where-Object { $_.type -eq "page" })[0]

if (-not $page -or -not $page.webSocketDebuggerUrl) {
  throw "No Chrome page target found at $CdpHost"
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync([Uri] $page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$script:nextId = 1

function Receive-CdpMessage {
  $bufferBytes = New-Object byte[] 1048576
  $buffer = [ArraySegment[byte]]::new($bufferBytes)
  $stream = [System.IO.MemoryStream]::new()

  do {
    $result = $socket.ReceiveAsync($buffer, [Threading.CancellationToken]::None).Result
    $stream.Write($buffer.Array, 0, $result.Count)
  } while (-not $result.EndOfMessage)

  $payload = [Text.Encoding]::UTF8.GetString($stream.ToArray())
  return $payload | ConvertFrom-Json
}

function Send-CdpCommand([string] $Method, [hashtable] $Params = @{}) {
  $id = $script:nextId
  $script:nextId += 1

  $payload = @{
    id = $id
    method = $Method
    params = $Params
  } | ConvertTo-Json -Depth 100 -Compress

  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()

  while ($true) {
    $message = Receive-CdpMessage
    if ($message.id -eq $id) {
      if ($message.error) {
        throw "$($message.error.message): $($message.error.data)"
      }
      return $message.result
    }
  }
}

function Wait-ForExpression([string] $Expression) {
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    $result = Send-CdpCommand "Runtime.evaluate" @{
      expression = "Boolean($Expression)"
      returnByValue = $true
    }
    if ($result.result.value -eq $true) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Timed out waiting for: $Expression"
}

try {
  Send-CdpCommand "Page.enable" | Out-Null
  Send-CdpCommand "Runtime.enable" | Out-Null
  Send-CdpCommand "Emulation.setDeviceMetricsOverride" @{
    width = 390
    height = 844
    deviceScaleFactor = 1
    mobile = $true
  } | Out-Null
  Send-CdpCommand "Page.navigate" @{ url = $TargetUrl } | Out-Null
  Wait-ForExpression "document.querySelector('.conversation') && document.querySelector('.composer') && document.querySelector('.topbar')"
  Wait-ForExpression "document.readyState === 'complete' && Array.from(document.styleSheets).some((sheet) => !sheet.disabled)"

  $measurement = @"
(async () => {
  const conversation = document.querySelector('.conversation');
  const composer = document.querySelector('.composer');
  const header = document.querySelector('.topbar');
  const workspace = document.querySelector('.workspace');
  const shell = document.querySelector('.chat-shell');

  if (!(conversation instanceof HTMLElement) || !(composer instanceof HTMLElement) || !(header instanceof HTMLElement) || !(workspace instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
    throw new Error('Required chat layout elements were not found');
  }

  const composers = Array.from(document.querySelectorAll('.composer'));
  const initialComposerRect = composer.getBoundingClientRect();
  const initialHeaderRect = header.getBoundingClientRect();
  const visualViewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const initial = {
    composerCount: composers.length,
    composerVisible: composer.checkVisibility
      ? composer.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : getComputedStyle(composer).display !== 'none' && getComputedStyle(composer).visibility !== 'hidden',
    composer: {
      top: initialComposerRect.top,
      bottom: initialComposerRect.bottom,
      height: initialComposerRect.height,
    },
    header: {
      top: initialHeaderRect.top,
      bottom: initialHeaderRect.bottom,
      height: initialHeaderRect.height,
    },
    innerHeight: window.innerHeight,
    visualViewportHeight,
    composerInLayoutViewport: initialComposerRect.top >= 0 && initialComposerRect.bottom <= window.innerHeight,
    composerInVisualViewport: initialComposerRect.top >= 0 && initialComposerRect.bottom <= visualViewportHeight,
    windowScrollY: window.scrollY,
    bodyScrollTop: document.body.scrollTop,
    documentScrollTop: document.documentElement.scrollTop,
  };

  const paragraphs = Array.from({ length: 90 }, (_, index) => (
    '<p>Composer fixed scroll verification paragraph ' + (index + 1) + ': game result, scoring, pitching, batting, and follow-up content.</p>'
  )).join('');

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
  ].join('');

  const round = (value) => Math.round(value * 100) / 100;
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: round(rect.top),
      bottom: round(rect.bottom),
      height: round(rect.height),
    };
  };
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
  });
  const stable = (a, b, key) => Math.abs(a[key] - b[key]) <= $TolerancePx;
  const stableRect = (a, b) => (
    stable(a, b, 'top') &&
    stable(a, b, 'bottom') &&
    stable(a, b, 'height')
  );

  conversation.scrollTop = 0;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const before = measure('before');

  conversation.scrollTop = Math.min(800, conversation.scrollHeight - conversation.clientHeight);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const after800 = measure('after-800');

  conversation.scrollTop = Math.min(1600, conversation.scrollHeight - conversation.clientHeight);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const after1600 = measure('after-1600');

  return {
    targetViewport: { width: 390, height: 844 },
    composerParentClass: composer.parentElement?.className ?? null,
    conversationContainsComposer: conversation.contains(composer),
    initial,
    before,
    after800,
    after1600,
    invariants: {
      composerOutsideConversation: !conversation.contains(composer),
      composerParentIsWorkspace: composer.parentElement === workspace,
      exactlyOneComposer: initial.composerCount === 1,
      initialComposerVisible: initial.composerVisible,
      initialComposerInLayoutViewport: initial.composerInLayoutViewport,
      initialComposerInVisualViewport: initial.composerInVisualViewport,
      initialPageDidNotScroll: initial.windowScrollY === 0 && initial.bodyScrollTop === 0 && initial.documentScrollTop === 0,
      composerStableAfter800: stableRect(before.composer, after800.composer),
      composerStableAfter1600: stableRect(before.composer, after1600.composer),
      composerOffsetTopStableAfter1600: Math.abs(before.composerOffsetTop - after1600.composerOffsetTop) <= $TolerancePx,
      headerStableAfter1600: stableRect(before.header, after1600.header),
      conversationScrolled: after800.conversationScrollTop > before.conversationScrollTop && after1600.conversationScrollTop > after800.conversationScrollTop,
      windowDidNotScroll: before.windowScrollY === 0 && after800.windowScrollY === 0 && after1600.windowScrollY === 0,
      bodyDidNotScroll: before.bodyScrollTop === 0 && after800.bodyScrollTop === 0 && after1600.bodyScrollTop === 0,
      documentDidNotScroll: before.documentScrollTop === 0 && after800.documentScrollTop === 0 && after1600.documentScrollTop === 0,
      shellDidNotScroll: before.shellScrollTop === 0 && after800.shellScrollTop === 0 && after1600.shellScrollTop === 0,
      workspaceDidNotScroll: before.workspaceScrollTop === 0 && after800.workspaceScrollTop === 0 && after1600.workspaceScrollTop === 0,
    },
  };
})()
"@

  $result = Send-CdpCommand "Runtime.evaluate" @{
    expression = $measurement
    awaitPromise = $true
    returnByValue = $true
  }

  $report = $result.result.value
  $report | ConvertTo-Json -Depth 100

  $failed = @()
  foreach ($property in $report.invariants.PSObject.Properties) {
    if ($property.Value -ne $true) {
      $failed += $property.Name
    }
  }

  if ($failed.Count -gt 0) {
    throw "Composer fixed-position verification failed: $($failed -join ', ')"
  }
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    try {
      $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).Wait()
    } catch {
      # The browser may close the CDP page socket first after a successful measurement.
    }
  }
  $socket.Dispose()
}
