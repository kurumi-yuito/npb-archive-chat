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
  npbSearchDbMode?: unknown
  npbDailyUpdateGithubOwner?: unknown
  npbDailyUpdateGithubRepo?: unknown
  npbDailyUpdateGithubWorkflow?: unknown
  npbDailyUpdateGithubRef?: unknown
  npbDailyUpdateGithubToken?: unknown
  NPB_SEARCH_DB_MODE?: unknown
  NPB_DAILY_UPDATE_GITHUB_OWNER?: unknown
  NPB_DAILY_UPDATE_GITHUB_REPO?: unknown
  NPB_DAILY_UPDATE_GITHUB_WORKFLOW?: unknown
  NPB_DAILY_UPDATE_GITHUB_REF?: unknown
  NPB_DAILY_UPDATE_GITHUB_TOKEN?: unknown
}): CloudflareCronDailyUpdateDispatchConfig | null {
  const searchDbMode = stringValue(config.NPB_SEARCH_DB_MODE, config.npbSearchDbMode)
  if (searchDbMode === 'read_only_validation_shared_production_db') {
    throw new Error('Cloudflare Cron dispatch is disabled for read-only validation environments sharing production NPB_DB')
  }

  const githubOwner = stringValue(config.NPB_DAILY_UPDATE_GITHUB_OWNER, config.npbDailyUpdateGithubOwner)
  const githubRepo = stringValue(config.NPB_DAILY_UPDATE_GITHUB_REPO, config.npbDailyUpdateGithubRepo)
  const githubWorkflow = stringValue(config.NPB_DAILY_UPDATE_GITHUB_WORKFLOW, config.npbDailyUpdateGithubWorkflow)
  const githubRef = stringValue(config.NPB_DAILY_UPDATE_GITHUB_REF, config.npbDailyUpdateGithubRef)
  const githubToken = stringValue(config.NPB_DAILY_UPDATE_GITHUB_TOKEN, config.npbDailyUpdateGithubToken)

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

function stringValue(primary: unknown, fallback: unknown): string {
  const primaryValue = typeof primary === 'string' ? primary.trim() : ''
  if (primaryValue) {
    return primaryValue
  }
  return typeof fallback === 'string' ? fallback.trim() : ''
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
