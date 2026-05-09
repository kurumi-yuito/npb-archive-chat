import { describe, expect, it } from 'vitest'
import {
  buildCloudflareCronDailyUpdateDispatchRequest,
  resolveCloudflareCronDailyUpdateDispatchConfig,
} from '../server/services/cloudflare-cron-update-dispatch'

describe('cloudflare cron daily update dispatch', () => {
  it('resolves config from runtime values', () => {
    expect(
      resolveCloudflareCronDailyUpdateDispatchConfig({
        npbDailyUpdateGithubOwner: 'kurumi-yuito',
        npbDailyUpdateGithubRepo: 'npb-archive-chat',
        npbDailyUpdateGithubWorkflow: 'daily-update.yml',
        npbDailyUpdateGithubRef: 'main',
        npbDailyUpdateGithubToken: 'secret-token',
      }),
    ).toEqual({
      githubOwner: 'kurumi-yuito',
      githubRepo: 'npb-archive-chat',
      githubWorkflow: 'daily-update.yml',
      githubRef: 'main',
      githubToken: 'secret-token',
    })
  })

  it('returns null when the github dispatch config is incomplete', () => {
    expect(
      resolveCloudflareCronDailyUpdateDispatchConfig({
        npbDailyUpdateGithubOwner: 'kurumi-yuito',
        npbDailyUpdateGithubRepo: 'npb-archive-chat',
        npbDailyUpdateGithubToken: 'secret-token',
      }),
    ).toBeNull()
  })

  it('builds the GitHub workflow dispatch request', () => {
    const request = buildCloudflareCronDailyUpdateDispatchRequest({
      githubOwner: 'kurumi-yuito',
      githubRepo: 'npb-archive-chat',
      githubWorkflow: 'daily-update.yml',
      githubRef: 'main',
      githubToken: 'secret-token',
    })

    expect(request.url).toBe(
      'https://api.github.com/repos/kurumi-yuito/npb-archive-chat/actions/workflows/daily-update.yml/dispatches',
    )
    expect(request.init).toMatchObject({
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
    })
    expect(JSON.parse(String(request.init.body))).toEqual({ ref: 'main' })
  })
})
