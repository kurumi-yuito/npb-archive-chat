import { defineNuxtConfig } from 'nuxt/config'

const nitroPreset = process.env.NITRO_PRESET
const isDev = process.env.NODE_ENV !== 'production'
const devAppManifestPath = new URL('./.nuxt/manifest/meta/dev.json', import.meta.url)

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
        '#app-manifest': devAppManifestPath.pathname,
      }
    : {},
  vite: isDev
    ? {
        resolve: {
          alias: {
            '#app-manifest': devAppManifestPath.pathname,
          },
        },
      }
    : {},
  runtimeConfig: {
    npbSqlitePath: process.env.NPB_SQLITE_PATH ?? '',
    npbSqliteDir: process.env.NPB_SQLITE_DIR ?? '',
    chatQueryLlmBaseUrl: process.env.CHAT_QUERY_LLM_BASE_URL ?? 'https://api.openai.com/v1',
    chatQueryLlmApiKey: process.env.CHAT_QUERY_LLM_API_KEY ?? '',
    chatQueryLlmModel: process.env.CHAT_QUERY_LLM_MODEL ?? '',
    chatAnswerLlmBaseUrl: process.env.CHAT_ANSWER_LLM_BASE_URL ?? 'https://api.openai.com/v1',
    chatAnswerLlmApiKey: process.env.CHAT_ANSWER_LLM_API_KEY ?? '',
    chatAnswerLlmModel: process.env.CHAT_ANSWER_LLM_MODEL ?? '',
    npbAuthHeaderFallback:
      process.env.NPB_AUTH_HEADER_FALLBACK ?? (isDev ? 'true' : 'false'),
    npbAuthSharedSecret: process.env.NPB_AUTH_SHARED_SECRET ?? '',
    npbBillingConfigured: process.env.NPB_BILLING_CONFIGURED ?? 'false',
    npbDefaultPlan: process.env.NPB_DEFAULT_PLAN ?? 'free',
  },
})
