import { readBody } from 'h3'
import { ZodError } from 'zod'
import { updateChatAccountPlan } from '@npb/db'
import { chatAccountSchema, updateChatSubscriptionRequestSchema } from '@npb/schemas'
import { resolveChatRuntimeAuthConfig } from '../../utils/chat-runtime-config'
import { buildChatAccountResponse } from '../../utils/chat-account-response'
import { parseChatIdentity } from '../../utils/parse-chat-identity'
import { createPublicApiError } from '../../utils/public-api-error'
import { getServerDatabase } from '../../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerDatabase(event, config.npbSqlitePath)
    const body = updateChatSubscriptionRequestSchema.parse(await readBody(event))
    const account = await updateChatAccountPlan(database, identity.userId, body.plan)
    return chatAccountSchema.parse(buildChatAccountResponse(account, authConfig.billingConfigured))
  } catch (error) {
    if (error instanceof ZodError) {
      throw createPublicApiError(400, 'invalid_request', 'Invalid subscription request', {
        validation: error.flatten(),
      })
    }
    if (error instanceof Error && error.message.includes('not set')) {
      throw createPublicApiError(503, 'missing_env', error.message)
    }
    throw error
  }
})
