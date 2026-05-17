import { getQuery, sendRedirect } from 'h3'
import { linkOrCreateGoogleChatAccount } from '@npb/db'
import { resolveChatRuntimeAuthConfig } from '../../../utils/chat-runtime-config'
import { exchangeGoogleCodeForUser } from '../../../utils/google-auth'
import { createPublicApiError } from '../../../utils/public-api-error'
import { getSignedGuestUserId, setSignedAuthUserId } from '../../../utils/parse-chat-identity'
import { getServerMetaDatabase } from '../../../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const authConfig = resolveChatRuntimeAuthConfig(config, event)
  const query = getQuery(event)
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''
  if (!code) {
    throw createPublicApiError(400, 'google_code_missing', 'Google authorization code is missing')
  }
  const googleUser = await exchangeGoogleCodeForUser(event, authConfig, code, state)
  const database = await getServerMetaDatabase(event, config.npbSqlitePath)
  const guestUserId = getSignedGuestUserId(event, authConfig.authSharedSecret)
  const account = await linkOrCreateGoogleChatAccount(database, {
    guestUserId,
    googleSubject: googleUser.sub,
    email: googleUser.email,
    emailVerified: googleUser.emailVerified,
    displayName: googleUser.name,
  }, authConfig.defaultPlan)
  setSignedAuthUserId(event, account.userId, authConfig.authSharedSecret)
  await sendRedirect(event, '/chat?auth=google', 302)
})
