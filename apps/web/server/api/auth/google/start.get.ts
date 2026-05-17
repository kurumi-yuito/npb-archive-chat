import { resolveChatRuntimeAuthConfig } from '../../../utils/chat-runtime-config'
import { redirectToGoogleAuth } from '../../../utils/google-auth'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const authConfig = resolveChatRuntimeAuthConfig(config, event)
  await redirectToGoogleAuth(event, authConfig)
})
