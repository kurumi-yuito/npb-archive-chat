import { sendNoContent } from 'h3'
import { resolveChatRuntimeAuthConfig } from '../../utils/chat-runtime-config'
import { clearSignedAuthUserId } from '../../utils/parse-chat-identity'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  resolveChatRuntimeAuthConfig(config, event)
  clearSignedAuthUserId(event)
  return sendNoContent(event, 204)
})
