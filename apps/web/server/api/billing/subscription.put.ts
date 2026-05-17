import { readBody } from 'h3'
import { ZodError } from 'zod'
import { getChatAccount, getOrCreateChatAccount, updateChatAccountBillingState } from '@npb/db'
import { billingActionResponseSchema, chatAccountSchema, updateChatSubscriptionRequestSchema } from '@npb/schemas'
import { resolveChatRuntimeAuthConfig, resolveChatRuntimeStripeBillingConfig } from '../../utils/chat-runtime-config'
import { buildChatAccountResponse } from '../../utils/chat-account-response'
import { createStripeCheckoutSession, createStripePortalSession } from '../../utils/stripe-billing'
import { parseChatIdentity } from '../../utils/parse-chat-identity'
import { createPublicApiError } from '../../utils/public-api-error'
import { getServerMetaDatabase } from '../../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  try {
    const authConfig = resolveChatRuntimeAuthConfig(config, event)
    const billingConfig = resolveChatRuntimeStripeBillingConfig(config, event)
    const identity = parseChatIdentity(event, authConfig)
    const database = await getServerMetaDatabase(event, config.npbSqlitePath)
    const body = updateChatSubscriptionRequestSchema.parse(await readBody(event))
    const currentAccount =
      (await getChatAccount(database, identity.userId)) ??
      (await getOrCreateChatAccount(database, identity.userId, authConfig.defaultPlan ?? 'free'))

    if (body.plan === 'pro' && currentAccount.plan !== 'pro') {
      if (identity.authProvider !== 'google') {
        throw createPublicApiError(401, 'login_required', 'Google login is required before starting a paid subscription')
      }
      const session = await createStripeCheckoutSession(billingConfig, {
        userId: identity.userId,
        email: currentAccount.email,
        displayName: currentAccount.displayName,
      })
      await updateChatAccountBillingState(database, identity.userId, {
        plan: currentAccount.plan,
        billingStatus: 'incomplete',
        billingProvider: 'stripe',
        stripeCheckoutSessionId: session.id,
      })
      return billingActionResponseSchema.parse({
        redirectUrl: session.url,
        provider: 'stripe',
      })
    }

    if (body.plan === 'pro' && currentAccount.plan === 'pro') {
      if (!currentAccount.stripeCustomerId) {
        throw createPublicApiError(409, 'billing_customer_missing', 'Stripe customer is not configured for this account')
      }
      const session = await createStripePortalSession(billingConfig, {
        customerId: currentAccount.stripeCustomerId,
      })
      return billingActionResponseSchema.parse({
        redirectUrl: session.url,
        provider: 'stripe',
      })
    }

    if (currentAccount.plan !== 'pro') {
      return chatAccountSchema.parse(
        buildChatAccountResponse(currentAccount, billingConfig.billingConfigured, authConfig.googleAuthConfigured),
      )
    }

    if (!currentAccount.stripeCustomerId) {
      throw createPublicApiError(409, 'billing_customer_missing', 'Stripe customer is not configured for this account')
    }

    const session = await createStripePortalSession(billingConfig, {
      customerId: currentAccount.stripeCustomerId,
    })
    return billingActionResponseSchema.parse({
      redirectUrl: session.url,
      provider: 'stripe',
    })
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
