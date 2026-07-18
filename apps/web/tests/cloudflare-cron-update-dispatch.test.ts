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

  it('refuses to dispatch daily update from a read-only validation environment sharing production NPB_DB', () => {
    expect(() =>
      resolveCloudflareCronDailyUpdateDispatchConfig({
        NPB_SEARCH_DB_MODE: 'read_only_validation_shared_production_db',
        NPB_DAILY_UPDATE_GITHUB_OWNER: 'kurumi-yuito',
        NPB_DAILY_UPDATE_GITHUB_REPO: 'npb-archive-chat',
        NPB_DAILY_UPDATE_GITHUB_WORKFLOW: 'daily-update.yml',
        NPB_DAILY_UPDATE_GITHUB_REF: 'main',
        NPB_DAILY_UPDATE_GITHUB_TOKEN: 'secret-token',
      }),
    ).toThrow('read-only validation environments')
  })

  it('prefers Cloudflare runtime env names over build-time runtime config names', () => {
    expect(
      resolveCloudflareCronDailyUpdateDispatchConfig({
        npbDailyUpdateGithubOwner: '',
        npbDailyUpdateGithubRepo: '',
        npbDailyUpdateGithubWorkflow: 'daily-update.yml',
        npbDailyUpdateGithubRef: 'main',
        npbDailyUpdateGithubToken: '',
        NPB_DAILY_UPDATE_GITHUB_OWNER: 'kurumi-yuito',
        NPB_DAILY_UPDATE_GITHUB_REPO: 'npb-archive-chat',
        NPB_DAILY_UPDATE_GITHUB_WORKFLOW: 'daily-update.yml',
        NPB_DAILY_UPDATE_GITHUB_REF: 'main',
        NPB_DAILY_UPDATE_GITHUB_TOKEN: 'secret-token',
      }),
    ).toEqual({
      githubOwner: 'kurumi-yuito',
      githubRepo: 'npb-archive-chat',
      githubWorkflow: 'daily-update.yml',
      githubRef: 'main',
      githubToken: 'secret-token',
    })
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
