import { describe, expect, it } from 'vitest'
import { resolveChatRuntimeAuthConfig, resolveChatRuntimeStripeBillingConfig } from '../server/utils/chat-runtime-config'

describe('chat-runtime-config', () => {
  it('prefers Cloudflare env values over runtime config defaults', () => {
    const result = resolveChatRuntimeAuthConfig(
      {
        npbAuthHeaderFallback: 'false',
        npbAuthSharedSecret: '',
        npbDefaultPlan: 'free',
      },
      {
        context: {
          cloudflare: {
            env: {
              NPB_AUTH_HEADER_FALLBACK: 'true',
              NPB_AUTH_SHARED_SECRET: 'secret-from-env',
              NPB_DEFAULT_PLAN: 'pro',
              NPB_GOOGLE_CLIENT_ID: 'google-client',
              NPB_GOOGLE_CLIENT_SECRET: 'google-secret',
              NPB_GOOGLE_REDIRECT_URL: 'https://example.com/api/auth/google/callback',
            },
          },
        },
      } as never,
    )

    expect(result).toEqual({
      allowHeaderFallback: true,
      authSharedSecret: 'secret-from-env',
      defaultPlan: 'pro',
      googleClientId: 'google-client',
      googleClientSecret: 'google-secret',
      googleRedirectUrl: 'https://example.com/api/auth/google/callback',
      googleAuthConfigured: true,
    })
  })

  it('resolves Stripe billing config from Cloudflare env values', () => {
    const result = resolveChatRuntimeStripeBillingConfig(
      {
        npbStripeSecretKey: '',
        npbStripeWebhookSecret: '',
        npbStripeProPriceId: '',
        npbStripeCheckoutSuccessUrl: '',
        npbStripeCheckoutCancelUrl: '',
        npbStripePortalReturnUrl: '',
      },
      {
        context: {
          cloudflare: {
            env: {
              NPB_STRIPE_SECRET_KEY: 'sk_test_123',
              NPB_STRIPE_WEBHOOK_SECRET: 'whsec_123',
              NPB_STRIPE_PRO_PRICE_ID: 'price_123',
              NPB_STRIPE_CHECKOUT_SUCCESS_URL: 'https://example.com/success',
              NPB_STRIPE_CHECKOUT_CANCEL_URL: 'https://example.com/cancel',
              NPB_STRIPE_PORTAL_RETURN_URL: 'https://example.com/account',
            },
          },
        },
      } as never,
    )

    expect(result).toEqual({
      billingConfigured: true,
      secretKey: 'sk_test_123',
      webhookSecret: 'whsec_123',
      proPriceId: 'price_123',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      portalReturnUrl: 'https://example.com/account',
    })
  })
})
