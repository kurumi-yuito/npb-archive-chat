import { defineNitroPlugin } from 'nitropack/runtime'
import {
  dispatchCloudflareCronDailyUpdate,
  resolveCloudflareCronDailyUpdateDispatchConfig,
} from '../services/cloudflare-cron-update-dispatch'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async (event) => {
    const config = useRuntimeConfig() as Record<string, unknown>
    const cloudflareEnv = (event as {
      context?: {
        cloudflare?: {
          env?: Record<string, unknown>
        }
      }
    }).context?.cloudflare?.env ?? {}
    const dispatchConfig = resolveCloudflareCronDailyUpdateDispatchConfig({
      ...config,
      ...cloudflareEnv,
    })

    if (!dispatchConfig) {
      throw new Error(
        'Cloudflare Cron is enabled but NPB_DAILY_UPDATE_GITHUB_OWNER / NPB_DAILY_UPDATE_GITHUB_REPO / NPB_DAILY_UPDATE_GITHUB_WORKFLOW / NPB_DAILY_UPDATE_GITHUB_REF / NPB_DAILY_UPDATE_GITHUB_TOKEN are not configured',
      )
    }

    await dispatchCloudflareCronDailyUpdate(dispatchConfig, {
      cron: event.controller.cron,
      scheduledTime: event.controller.scheduledTime,
    })
  })
})
