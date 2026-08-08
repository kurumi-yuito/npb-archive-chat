import type { ChatAccount, ChatPlan, ChatRequest, ChatResponse, ChatUsageInfo } from '@npb/schemas'
import { computed, onMounted, ref } from 'vue'

export type ChatTurn = {
  id: string
  userMessage: string
  assistant: ChatResponse | null
  errorMessage: string | null
}

function chatRequestHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  }
}

async function parseErrorJson(res: Response): Promise<{
  statusMessage?: string
  message?: string
  data?: { code?: string; usage?: ChatUsageInfo }
} | null> {
  return (await res.json().catch(() => null)) as {
    statusMessage?: string
    message?: string
    data?: { code?: string; usage?: ChatUsageInfo }
  } | null
}

export function userFacingChatError(status: number, usage?: ChatUsageInfo): string {
  if (status === 429 && usage) {
    return usage.plan === 'free' && usage.limit !== null
      ? `質問回数を使い切りました。残り${usage.remaining ?? 0}回。次の質問まで${formatRemainingDuration(usage.nextTokenAt, usage.asOf)}です。`
      : '利用上限に達しました。'
  }
  if (status === 401 || status === 403) {
    return 'ログイン状態を確認してください。'
  }
  if (status === 503) {
    return '現在チャットを利用できません。時間をおいて再度お試しください。'
  }
  if (status >= 500) {
    return '回答の生成中に問題が発生しました。時間をおいて再度お試しください。'
  }
  return '質問を処理できませんでした。入力を変えて再度お試しください。'
}

export function formatRemainingDuration(target: string | null, from = new Date().toISOString()): string {
  if (!target) return '0分'
  const milliseconds = Math.max(0, Date.parse(target) - Date.parse(from))
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}分`
  if (minutes === 0) return `${hours}時間`
  return `${hours}時間${minutes}分`
}

export function userFacingAccountError(status?: number): string {
  if (status === 401 || status === 403) {
    return 'ログイン状態を確認してください。'
  }
  if (status === 503) {
    return '現在アカウント機能を利用できません。時間をおいて再度お試しください。'
  }
  return 'アカウント情報を更新できませんでした。'
}

export function userFacingBillingError(status?: number): string {
  if (status === 401 || status === 403) {
    return 'Pro を開始するには Google ログインが必要です。'
  }
  if (status === 503) {
    return '現在課金機能を利用できません。時間をおいて再度お試しください。'
  }
  return 'プランを変更できませんでした。時間をおいて再度お試しください。'
}

function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    return Number.isFinite(status) ? status : undefined
  }
  return undefined
}

function withStatus(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

async function readUsageFromError(res: Response): Promise<ChatUsageInfo | undefined> {
  const errBody = await parseErrorJson(res)
  const usageFromError =
    errBody?.data && typeof errBody.data === 'object' && 'usage' in errBody.data
      ? (errBody.data as { usage: ChatUsageInfo }).usage
      : undefined
  return usageFromError
}

function buildChatRequestHistory(turns: ChatTurn[]): ChatRequest['history'] {
  return turns
    .flatMap((turn) => [
      { role: 'user' as const, content: turn.userMessage },
      ...(turn.assistant
        ? [{ role: 'assistant' as const, content: turn.assistant.answer.summary }]
        : []),
    ])
    .slice(-12)
}

export function extractSafeFallbackErrorMessage(error: unknown): string {
  const status = errorStatus(error)
  if (status) {
    return error instanceof Error ? error.message : userFacingChatError(status)
  }
  if (error instanceof TypeError) {
    return '通信に失敗しました。接続状態を確認してください。'
  }
  return '処理中に問題が発生しました。時間をおいて再度お試しください。'
}

export function useChat() {
  const turns = ref<ChatTurn[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)
  const usageInfo = ref<ChatUsageInfo | null>(null)
  const accountInfo = ref<ChatAccount | null>(null)
  const userId = ref('')
  const plan = ref<ChatPlan>('free')
  const accountSaving = ref(false)
  const isGoogleAuthenticated = computed(() => accountInfo.value?.authProvider === 'google')

  async function refreshAccount() {
    if (!import.meta.client) return
    try {
      const res = await fetch('/api/account')
      if (!res.ok) return
      const account = (await res.json()) as ChatAccount
      accountInfo.value = account
      plan.value = account.plan
      userId.value = account.userId
    } catch {
      accountInfo.value = null
    }
  }

  async function refreshUsage() {
    if (!import.meta.client) return
    try {
      const res = await fetch('/api/chat/usage')
      if (!res.ok) return
      usageInfo.value = (await res.json()) as ChatUsageInfo
    } catch {
      usageInfo.value = null
    }
  }

  onMounted(() => {
    void (async () => {
      await refreshAccount()
      await refreshUsage()
    })()
  })

  async function updatePlan(nextPlan: ChatPlan) {
    if (!import.meta.client) return
    if (nextPlan === 'pro' && !isGoogleAuthenticated.value) {
      window.location.href = '/api/auth/google/start'
      return
    }
    accountSaving.value = true
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'PUT',
        headers: chatRequestHeaders(),
        body: JSON.stringify({ plan: nextPlan }),
      })
      if (!res.ok) {
        throw withStatus(userFacingBillingError(res.status), res.status)
      }
      const payload = (await res.json()) as ChatAccount | { redirectUrl?: string; provider?: string }
      if (payload && typeof payload === 'object' && 'redirectUrl' in payload && payload.redirectUrl) {
        window.location.href = payload.redirectUrl
        return
      }
      const account = payload as ChatAccount
      accountInfo.value = account
      plan.value = account.plan
      await refreshUsage()
    } catch (error) {
      lastError.value = userFacingBillingError(errorStatus(error))
    } finally {
      accountSaving.value = false
    }
  }

  async function updateAccountProfile(input: { email?: string | null; displayName?: string | null }) {
    if (!import.meta.client) return
    accountSaving.value = true
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: chatRequestHeaders(),
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        throw withStatus(userFacingAccountError(res.status), res.status)
      }
      const account = (await res.json()) as ChatAccount
      accountInfo.value = account
      plan.value = account.plan
    } catch (error) {
      lastError.value = userFacingAccountError(errorStatus(error))
    } finally {
      accountSaving.value = false
    }
  }

  async function logout() {
    if (!import.meta.client) return
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    accountInfo.value = null
    usageInfo.value = null
    void (async () => {
      await refreshAccount()
      await refreshUsage()
    })()
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading.value) return

    lastError.value = null
    const id = crypto.randomUUID()
    const history = buildChatRequestHistory(turns.value)
    turns.value.push({
      id,
      userMessage: trimmed,
      assistant: null,
      errorMessage: null,
    })

    loading.value = true
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: chatRequestHeaders(),
        body: JSON.stringify({ message: trimmed, history }),
      })

      if (!res.ok) {
        const usageFromError = await readUsageFromError(res)
        if (res.status === 429 && usageFromError) {
          usageInfo.value = usageFromError
          throw withStatus(userFacingChatError(res.status, usageFromError), res.status)
        }
        throw withStatus(userFacingChatError(res.status), res.status)
      }

      const response = (await res.json()) as ChatResponse
      usageInfo.value = response.usage
      plan.value = response.usage.plan
      const turn = turns.value.find((t) => t.id === id)
      if (turn) turn.assistant = response
    } catch (error: unknown) {
      const msg = extractSafeFallbackErrorMessage(error)
      lastError.value = msg
      const turn = turns.value.find((t) => t.id === id)
      if (turn) turn.errorMessage = msg
    } finally {
      loading.value = false
    }
  }

  return {
    turns,
    loading,
    lastError,
    usageInfo,
    accountInfo,
    userId,
    plan,
    accountSaving,
    isGoogleAuthenticated,
    refreshAccount,
    refreshUsage,
    updatePlan,
    updateAccountProfile,
    logout,
    sendMessage,
  }
}
