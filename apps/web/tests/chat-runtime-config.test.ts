import { describe, expect, it } from 'vitest'
import { resolveChatRuntimeAuthConfig } from '../server/utils/chat-runtime-config'

describe('chat-runtime-config', () => {
  it('prefers Cloudflare env values over runtime config defaults', () => {
    const result = resolveChatRuntimeAuthConfig(
      {
        npbAuthHeaderFallback: 'false',
        npbAuthSharedSecret: '',
        npbBillingConfigured: 'false',
        npbDefaultPlan: 'free',
      },
      {
        context: {
          cloudflare: {
            env: {
              NPB_AUTH_HEADER_FALLBACK: 'true',
              NPB_AUTH_SHARED_SECRET: 'secret-from-env',
              NPB_BILLING_CONFIGURED: 'true',
              NPB_DEFAULT_PLAN: 'pro',
            },
          },
        },
      } as never,
    )

    expect(result).toEqual({
      allowHeaderFallback: true,
      authSharedSecret: 'secret-from-env',
      billingConfigured: true,
      defaultPlan: 'pro',
    })
  })
})
