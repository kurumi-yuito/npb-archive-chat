import type { ChatAccount, ChatPlan, ChatResponse, ChatUsageInfo } from '@npb/schemas'
import { onMounted, ref } from 'vue'

const USER_STORAGE_KEY = 'npb-archive-chat-user-id'

export type ChatTurn = {
  id: string
  userMessage: string
  assistant: ChatResponse | null
  errorMessage: string | null
}

function getOrCreateUserId(): string {
  if (!import.meta.client) return ''
  let id = localStorage.getItem(USER_STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(USER_STORAGE_KEY, id)
  }
  return id
}

function chatRequestHeaders(): Record<string, string> {
  const userId = getOrCreateUserId()
  return {
    'Content-Type': 'application/json',
    'X-NPB-User-Id': userId,
  }
}

async function parseErrorJson(res: Response): Promise<{
  statusMessage?: string
  message?: string
  data?: { usage?: ChatUsageInfo }
} | null> {
  return (await res.json().catch(() => null)) as {
    statusMessage?: string
    message?: string
    data?: { usage?: ChatUsageInfo }
  } | null
}

function extractFetchErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const o = error as {
      statusMessage?: string
      message?: string
      data?: { statusMessage?: string; message?: string }
    }
    if (o.data?.statusMessage) return String(o.data.statusMessage)
    if (o.data?.message) return String(o.data.message)
    if (o.statusMessage) return String(o.statusMessage)
    if (o.message) return String(o.message)
  }
  if (error instanceof Error) return error.message
  return 'リクエストに失敗しました'
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

  async function refreshAccount() {
    if (!import.meta.client) return
    try {
      const res = await fetch('/api/account', {
        headers: {
          'X-NPB-User-Id': getOrCreateUserId(),
        },
      })
      if (!res.ok) return
      const account = (await res.json()) as ChatAccount
      accountInfo.value = account
      plan.value = account.plan
    } catch {
      accountInfo.value = null
    }
  }

  async function refreshUsage() {
    if (!import.meta.client) return
    try {
      const res = await fetch('/api/chat/usage', {
        headers: {
          'X-NPB-User-Id': getOrCreateUserId(),
        },
      })
      if (!res.ok) return
      usageInfo.value = (await res.json()) as ChatUsageInfo
    } catch {
      usageInfo.value = null
    }
  }

  onMounted(() => {
    userId.value = getOrCreateUserId()
    void (async () => {
      await refreshAccount()
      await refreshUsage()
    })()
  })

  async function updatePlan(nextPlan: ChatPlan) {
    if (!import.meta.client) return
    accountSaving.value = true
    try {
      const res = await fetch('/api/billing/subscription', {
        method: 'PUT',
        headers: chatRequestHeaders(),
        body: JSON.stringify({ plan: nextPlan }),
      })
      if (!res.ok) {
        const errBody = await parseErrorJson(res)
        throw new Error(errBody?.statusMessage ?? errBody?.message ?? `HTTP ${res.status}`)
      }
      const account = (await res.json()) as ChatAccount
      accountInfo.value = account
      plan.value = account.plan
      await refreshUsage()
    } catch (error) {
      lastError.value = extractFetchErrorMessage(error)
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
        const errBody = await parseErrorJson(res)
        throw new Error(errBody?.statusMessage ?? errBody?.message ?? `HTTP ${res.status}`)
      }
      const account = (await res.json()) as ChatAccount
      accountInfo.value = account
      plan.value = account.plan
    } catch (error) {
      lastError.value = extractFetchErrorMessage(error)
    } finally {
      accountSaving.value = false
    }
  }

  function regenerateUserId() {
    if (!import.meta.client) return
    const id = crypto.randomUUID()
    localStorage.setItem(USER_STORAGE_KEY, id)
    userId.value = id
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
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        const errBody = await parseErrorJson(res)
        const usageFromError =
          errBody?.data && typeof errBody.data === 'object' && 'usage' in errBody.data
            ? (errBody.data as { usage: ChatUsageInfo }).usage
            : undefined
        if (res.status === 429 && usageFromError) {
          usageInfo.value = usageFromError
          const u = usageFromError
          const msg =
            u.plan === 'free' && u.limit !== null
              ? `今月のチャットは上限（${u.limit}回）に達しました（${u.month}）。`
              : (errBody?.statusMessage ?? '利用上限に達しました')
          throw Object.assign(new Error(msg), { status: res.status })
        }
        const msg =
          errBody?.statusMessage ??
          errBody?.message ??
          `HTTP ${res.status}`
        throw Object.assign(new Error(msg), { status: res.status })
      }

      const response = (await res.json()) as ChatResponse
      usageInfo.value = response.usage
      plan.value = response.usage.plan
      const turn = turns.value.find((t) => t.id === id)
      if (turn) turn.assistant = response
    } catch (error: unknown) {
      const msg = extractFetchErrorMessage(error)
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
    refreshAccount,
    refreshUsage,
    updatePlan,
    updateAccountProfile,
    regenerateUserId,
    sendMessage,
  }
}
