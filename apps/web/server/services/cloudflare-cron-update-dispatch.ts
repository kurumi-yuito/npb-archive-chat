export type CloudflareCronDailyUpdateDispatchConfig = {
  githubOwner: string
  githubRepo: string
  githubWorkflow: string
  githubRef: string
  githubToken: string
}

export type CloudflareCronDailyUpdateDispatchRequest = {
  url: string
  init: RequestInit
}

export type CloudflareCronDailyUpdateDispatchContext = {
  cron: string
  scheduledTime: number
}

export function resolveCloudflareCronDailyUpdateDispatchConfig(config: {
  npbDailyUpdateGithubOwner?: unknown
  npbDailyUpdateGithubRepo?: unknown
  npbDailyUpdateGithubWorkflow?: unknown
  npbDailyUpdateGithubRef?: unknown
  npbDailyUpdateGithubToken?: unknown
}): CloudflareCronDailyUpdateDispatchConfig | null {
  const githubOwner = typeof config.npbDailyUpdateGithubOwner === 'string' ? config.npbDailyUpdateGithubOwner.trim() : ''
  const githubRepo = typeof config.npbDailyUpdateGithubRepo === 'string' ? config.npbDailyUpdateGithubRepo.trim() : ''
  const githubWorkflow = typeof config.npbDailyUpdateGithubWorkflow === 'string' ? config.npbDailyUpdateGithubWorkflow.trim() : ''
  const githubRef = typeof config.npbDailyUpdateGithubRef === 'string' ? config.npbDailyUpdateGithubRef.trim() : ''
  const githubToken = typeof config.npbDailyUpdateGithubToken === 'string' ? config.npbDailyUpdateGithubToken.trim() : ''

  if (!githubOwner || !githubRepo || !githubWorkflow || !githubRef || !githubToken) {
    return null
  }

  return {
    githubOwner,
    githubRepo,
    githubWorkflow,
    githubRef,
    githubToken,
  }
}

export function buildCloudflareCronDailyUpdateDispatchRequest(
  config: CloudflareCronDailyUpdateDispatchConfig,
): CloudflareCronDailyUpdateDispatchRequest {
  return {
    url: `https://api.github.com/repos/${encodeURIComponent(config.githubOwner)}/${encodeURIComponent(config.githubRepo)}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}/dispatches`,
    init: {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${config.githubToken}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        ref: config.githubRef,
      }),
    },
  }
}

export async function dispatchCloudflareCronDailyUpdate(
  config: CloudflareCronDailyUpdateDispatchConfig,
  context: CloudflareCronDailyUpdateDispatchContext,
  dependencies: {
    fetch?: typeof fetch
    logger?: Pick<Console, 'info' | 'warn' | 'error'>
  } = {},
): Promise<void> {
  const fetchFn = dependencies.fetch ?? globalThis.fetch
  const logger = dependencies.logger ?? console
  const request = buildCloudflareCronDailyUpdateDispatchRequest(config)

  logger.info?.(
    `[cloudflare-cron] dispatching daily update workflow cron=${context.cron} scheduled=${new Date(context.scheduledTime).toISOString()} repo=${config.githubOwner}/${config.githubRepo} workflow=${config.githubWorkflow} ref=${config.githubRef}`,
  )

  const response = await fetchFn(request.url, request.init)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Cloudflare Cron dispatch failed with status ${response.status}${body ? `: ${body}` : ''}`,
    )
  }

  logger.info?.(
    `[cloudflare-cron] dispatch succeeded status=${response.status} cron=${context.cron}`,
  )
}
