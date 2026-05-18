import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'

const nitroPreset = process.env.NITRO_PRESET
const isCloudflareBuild = nitroPreset === 'cloudflare_module'
const isDev = process.env.NODE_ENV !== 'production' && !isCloudflareBuild
const devAppManifestPath = fileURLToPath(new URL('./.nuxt/manifest/meta/dev.json', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-01-15',
  typescript: {
    strict: true,
  },
  // Cloudflare 向けは `pnpm build:cf` が NITRO_PRESET を設定する。
  // dev では Nuxt/Nitro の dev preset に任せ、production preset を強制しない。
  nitro: nitroPreset ? { preset: nitroPreset } : {},
  devServer: {
    port: 3000,
  },
  alias: isDev
    ? {
        '#app-manifest': devAppManifestPath,
      }
    : {},
  vite: isDev
    ? {
        resolve: {
          alias: [
            {
              find: /^#app-manifest$/,
              replacement: devAppManifestPath,
            },
          ],
        },
      }
    : {},
  runtimeConfig: {
    npbSqlitePath: process.env.NPB_SQLITE_PATH ?? '',
    npbSqliteDir: process.env.NPB_SQLITE_DIR ?? '',
    chatQueryLlmBaseUrl: process.env.CHAT_QUERY_LLM_BASE_URL ?? 'https://api.openai.com/v1',
    chatQueryLlmApiKey: process.env.CHAT_QUERY_LLM_API_KEY ?? '',
    chatQueryLlmModel: process.env.CHAT_QUERY_LLM_MODEL ?? '',
    chatAllowHeuristicFallback:
      process.env.CHAT_ALLOW_HEURISTIC_FALLBACK ?? (isDev ? 'true' : 'false'),
    chatAnswerLlmBaseUrl: process.env.CHAT_ANSWER_LLM_BASE_URL ?? 'https://api.openai.com/v1',
    chatAnswerLlmApiKey: process.env.CHAT_ANSWER_LLM_API_KEY ?? '',
    chatAnswerLlmModel: process.env.CHAT_ANSWER_LLM_MODEL ?? '',
    chatAllowDeterministicAnswerFallback:
      process.env.CHAT_ALLOW_DETERMINISTIC_ANSWER_FALLBACK ?? (isDev ? 'true' : 'false'),
    npbDailyUpdateGithubOwner: process.env.NPB_DAILY_UPDATE_GITHUB_OWNER ?? '',
    npbDailyUpdateGithubRepo: process.env.NPB_DAILY_UPDATE_GITHUB_REPO ?? '',
    npbDailyUpdateGithubWorkflow: process.env.NPB_DAILY_UPDATE_GITHUB_WORKFLOW ?? 'daily-update.yml',
    npbDailyUpdateGithubRef: process.env.NPB_DAILY_UPDATE_GITHUB_REF ?? 'main',
    npbDailyUpdateGithubToken: process.env.NPB_DAILY_UPDATE_GITHUB_TOKEN ?? '',
    npbAuthHeaderFallback:
      process.env.NPB_AUTH_HEADER_FALLBACK ?? (isDev ? 'true' : 'false'),
    npbAuthSharedSecret: process.env.NPB_AUTH_SHARED_SECRET ?? '',
    npbDefaultPlan: process.env.NPB_DEFAULT_PLAN ?? 'free',
    npbGoogleClientId: process.env.NPB_GOOGLE_CLIENT_ID ?? '',
    npbGoogleClientSecret: process.env.NPB_GOOGLE_CLIENT_SECRET ?? '',
    npbGoogleRedirectUrl: process.env.NPB_GOOGLE_REDIRECT_URL ?? '',
    npbStripeSecretKey: process.env.NPB_STRIPE_SECRET_KEY ?? '',
    npbStripeWebhookSecret: process.env.NPB_STRIPE_WEBHOOK_SECRET ?? '',
    npbStripeProPriceId: process.env.NPB_STRIPE_PRO_PRICE_ID ?? '',
    npbStripeCheckoutSuccessUrl: process.env.NPB_STRIPE_CHECKOUT_SUCCESS_URL ?? '',
    npbStripeCheckoutCancelUrl: process.env.NPB_STRIPE_CHECKOUT_CANCEL_URL ?? '',
    npbStripePortalReturnUrl: process.env.NPB_STRIPE_PORTAL_RETURN_URL ?? '',
  },
})
