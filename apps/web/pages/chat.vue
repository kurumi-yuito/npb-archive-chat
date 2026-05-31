<script setup lang="ts">
import type { ChatPlan, ChatResponse, ChatStructuredQuery } from '@npb/schemas'
import { computed, nextTick, ref } from 'vue'
import { useChat } from '~/composables/useChat'

defineOptions({ name: 'ChatPage' })

const input = ref('')
const conversationRef = ref<HTMLElement | null>(null)
const sidebarOpen = ref(false)
const {
  turns,
  loading,
  lastError,
  sendMessage,
  usageInfo,
  accountInfo,
  userId,
  plan,
  accountSaving,
  isGoogleAuthenticated,
  updatePlan,
  logout,
} = useChat()

const examplePrompts = [
  'ヤクルトサンタナの今年の成績',
  '藤浪晋太郎の所属チームは',
  '2025年にヤクルトの山田が打ったホームラン一覧',
  '2025年4月5日のヤクルト対中日のスタメン',
]

const lastAssistant = computed(() => {
  for (let i = turns.value.length - 1; i >= 0; i -= 1) {
    const turn = turns.value[i]
    if (turn?.assistant) return turn.assistant
  }
  return null
})

const usageLabel = computed(() => {
  const usage = usageInfo.value
  if (!usage) return '取得中'
  if (usage.limit === null) return '無制限'
  return `${usage.remaining} / ${usage.limit}`
})

const usageMeterStyle = computed(() => {
  const usage = usageInfo.value
  if (!usage || usage.limit === null) return { width: '100%' }
  const ratio = usage.limit === 0 ? 0 : Math.max(0, Math.min(1, (usage.remaining ?? 0) / usage.limit))
  return { width: `${ratio * 100}%` }
})

function structuredQueryLabel(q: ChatStructuredQuery): string {
  if (q.intent === 'search_events') return 'イベント検索'
  if (q.intent === 'search_games') return '試合一覧'
  if (q.intent === 'search_batting') return '打撃成績'
  if (q.intent === 'search_pitching') return '投手成績'
  if (q.intent === 'search_roster') return 'スタメン'
  if (q.intent === 'player_affiliation') return '所属'
  if (q.intent === 'game_detail') return '試合詳細'
  if (q.intent === 'aggregate_batting') return '打撃集計'
  if (q.intent === 'aggregate_pitching') return '投手集計'
  return 'イベント集計'
}

function inningHalfLabel(half: 'top' | 'bottom'): string {
  return half === 'top' ? '表' : '裏'
}

function visibleEvents(response: ChatResponse) {
  return response.results.events.slice(0, 20)
}

function visibleSources(response: ChatResponse): string[] {
  return response.answer.source_urls.slice(0, 8)
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function sourceLabel(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+\//u, '')
  return path.length > 64 ? `${path.slice(0, 61)}...` : path
}

async function submitText(text = input.value) {
  const trimmed = text.trim()
  if (!trimmed) return
  await sendMessage(trimmed)
  input.value = ''
  await nextTick()
  conversationRef.value?.scrollTo({ top: conversationRef.value.scrollHeight, behavior: 'smooth' })
}

function useExample(prompt: string) {
  input.value = prompt
  void submitText(prompt)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void submitText()
}

function onPlanChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const nextPlan: ChatPlan = value === 'pro' ? 'pro' : 'free'
  void updatePlan(nextPlan)
}

function loginWithGoogle() {
  window.location.href = '/api/auth/google/start'
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}
</script>

<template>
  <main class="chat-shell">
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="サイドバーを閉じる"
      @click="toggleSidebar"
    />
    <aside
      class="sidebar"
      :class="{ 'is-open': sidebarOpen }"
      aria-label="ユーザー設定"
    >
      <div class="brand">
        <NuxtLink
          class="brand__home"
          to="/"
        >
          NPB Archive
        </NuxtLink>
        <p class="brand__title">
          検索チャット
        </p>
      </div>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">
            アカウント
          </h2>
          <span
            class="status-dot"
            aria-hidden="true"
          />
        </div>
        <div
          class="account-id"
          :title="userId || 'local'"
        >
          {{ accountInfo?.authProvider === 'google' ? 'Google アカウント' : 'ゲスト' }}
        </div>
        <div
          v-if="userId"
          class="account-id account-id--sub"
          :title="userId"
        >
          {{ userId }}
        </div>
        <dl
          v-if="isGoogleAuthenticated"
          class="account-details"
        >
          <div>
            <dt>表示名</dt>
            <dd>{{ accountInfo?.displayName || '未設定' }}</dd>
          </div>
          <div>
            <dt>メール</dt>
            <dd>{{ accountInfo?.email || '未設定' }}</dd>
          </div>
        </dl>
        <button
          v-if="!isGoogleAuthenticated"
          class="text-button"
          type="button"
          :disabled="accountInfo?.googleAuthConfigured === false"
          @click="loginWithGoogle"
        >
          Google でログイン
        </button>
        <button
          v-else
          class="text-button"
          type="button"
          @click="logout"
        >
          ログアウト
        </button>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">
            プラン
          </h2>
          <span
            class="plan-pill"
            :class="`plan-pill--${plan}`"
          >{{ plan }}</span>
        </div>
        <label class="select-field">
          <span>現在のプラン</span>
          <select
            :value="plan"
            :disabled="accountSaving"
            @change="onPlanChange"
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <p
          v-if="!isGoogleAuthenticated"
          class="billing-note"
        >
          Pro は Google ログイン後に開始できます。
        </p>
        <div
          v-if="accountInfo?.billingPlan"
          class="billing-meta"
        >
          <div class="billing-meta__row">
            <span>料金</span>
            <strong>{{ accountInfo.billingPlan.monthlyPriceYen.toLocaleString('ja-JP') }}円 / 月</strong>
          </div>
          <div class="billing-meta__row">
            <span>支払い方法</span>
            <strong>{{ accountInfo.billingPlan.billingMethod }}</strong>
          </div>
          <div class="billing-meta__row">
            <span>上限</span>
            <strong>
              {{ accountInfo.billingPlan.monthlyUsageLimit === null ? '無制限' : `${accountInfo.billingPlan.monthlyUsageLimit}回 / 月` }}
            </strong>
          </div>
        </div>
        <div class="usage-card">
          <div class="usage-card__top">
            <span>{{ usageInfo?.month ?? '---- --' }}</span>
            <strong>{{ usageLabel }}</strong>
          </div>
          <div
            class="usage-meter"
            aria-hidden="true"
          >
            <span :style="usageMeterStyle" />
          </div>
        </div>
      </section>

      <section class="panel panel--quiet">
        <h2 class="panel__title">
          直近の検索
        </h2>
        <p
          v-if="!lastAssistant"
          class="muted"
        >
          まだありません
        </p>
        <template v-else>
          <div class="last-query">
            <span>{{ structuredQueryLabel(lastAssistant.structured_query) }}</span>
            <strong>{{ lastAssistant.answer.result_count }}件</strong>
          </div>
        </template>
      </section>
    </aside>

    <section
      class="workspace"
      aria-label="チャット"
    >
      <header class="topbar">
        <button
          class="topbar__menu"
          type="button"
          aria-label="サイドバーを開く"
          @click="toggleSidebar"
        >
          <span />
          <span />
          <span />
        </button>
        <div>
          <h1>NPBアーカイブ検索</h1>
          <p>公式 scores / BIS 由来のDBだけを根拠に回答します。</p>
        </div>
        <div class="topbar__usage">
          <span>{{ plan.toUpperCase() }}</span>
          <strong>{{ usageLabel }}</strong>
        </div>
      </header>

      <section
        v-if="lastError"
        class="error-banner"
        role="alert"
      >
        {{ lastError }}
      </section>

      <div
        ref="conversationRef"
        class="conversation"
      >
        <section
          v-if="turns.length === 0"
          class="empty-state"
        >
          <h2>何を調べますか？</h2>
          <div class="prompt-grid">
            <button
              v-for="prompt in examplePrompts"
              :key="prompt"
              class="prompt-card"
              type="button"
              :disabled="loading"
              @click="useExample(prompt)"
            >
              {{ prompt }}
            </button>
          </div>
        </section>

        <article
          v-for="turn in turns"
          :key="turn.id"
          class="turn"
        >
          <div class="message message--user">
            <div class="avatar avatar--user">
              ⚡
            </div>
            <div class="bubble bubble--user">
              {{ turn.userMessage }}
            </div>
          </div>

          <div
            v-if="turn.errorMessage"
            class="message message--assistant"
          >
            <div class="avatar avatar--assistant">
              ⚾
            </div>
            <div class="bubble bubble--error">
              {{ turn.errorMessage }}
            </div>
          </div>

          <div
            v-else-if="turn.assistant"
            class="message message--assistant"
          >
            <div class="avatar avatar--assistant">
              ⚾
            </div>
            <div class="answer">
              <div class="answer__head">
                <span class="intent-chip">
                  {{ structuredQueryLabel(turn.assistant.structured_query) }}
                </span>
                <span>{{ turn.assistant.answer.result_count }}件</span>
                <span v-if="turn.assistant.answer.remaining_count">
                  省略 {{ turn.assistant.answer.remaining_count }}件
                </span>
              </div>
              <p class="answer__summary">
                {{ turn.assistant.answer.summary }}
              </p>

              <div
                v-if="turn.assistant.answer.resolved_player?.status === 'ambiguous'"
                class="result-section"
              >
                <h3>候補</h3>
                <ul class="candidate-list">
                  <li
                    v-for="candidate in turn.assistant.answer.resolved_player.candidates"
                    :key="`${candidate.player_id}-${candidate.name}-${candidate.primary_team}`"
                  >
                    <span>{{ candidate.name }}</span>
                    <small>
                      <template v-if="candidate.primary_team">{{ candidate.primary_team }}</template>
                      <template v-if="candidate.player_id"> · {{ candidate.player_id }}</template>
                    </small>
                  </li>
                </ul>
              </div>

              <div
                v-if="turn.assistant.results.events.length"
                class="result-section"
              >
                <h3>イベント</h3>
                <ol class="event-list">
                  <li
                    v-for="event in visibleEvents(turn.assistant)"
                    :key="`${event.gameId}-${event.sequence}`"
                  >
                    <div class="event-list__line">
                      <strong>{{ event.gameDate }}</strong>
                      <span>{{ event.gameId }}</span>
                      <span>{{ event.inning }}回{{ inningHalfLabel(event.half) }}</span>
                    </div>
                    <p>
                      <template v-if="event.pitcherName">
                        {{ event.pitcherName }}から
                      </template>{{ event.resultText }}
                    </p>
                    <a
                      v-if="event.sourceUrl"
                      :href="event.sourceUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {{ sourceLabel(event.sourceUrl) }}
                    </a>
                  </li>
                </ol>
              </div>

              <div
                v-if="turn.assistant.results.batting.length"
                class="result-section"
              >
                <h3>打撃成績</h3>
                <div class="data-table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>年</th>
                        <th>チーム</th>
                        <th>選手</th>
                        <th>打数</th>
                        <th>安打</th>
                        <th>打点</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in turn.assistant.results.batting"
                        :key="`${row.gameId}-${row.playerName}`"
                      >
                        <td>{{ row.gameDate.slice(0, 4) }}</td>
                        <td>{{ row.team }}</td>
                        <td>{{ row.playerName }}</td>
                        <td>{{ row.atBats }}</td>
                        <td>{{ row.hits }}</td>
                        <td>{{ row.runsBattedIn }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                v-if="turn.assistant.results.affiliations.length"
                class="result-section"
              >
                <h3>所属</h3>
                <ul class="simple-list">
                  <li
                    v-for="row in turn.assistant.results.affiliations"
                    :key="`${row.year}-${row.team}-${row.playerId}`"
                  >
                    {{ row.year }}年 {{ row.playerName }} / {{ row.team }}
                  </li>
                </ul>
              </div>

              <div
                v-if="visibleSources(turn.assistant).length"
                class="result-section"
              >
                <details class="source-details">
                  <summary>ソース ({{ visibleSources(turn.assistant).length }}件)</summary>
                  <ul class="source-list">
                    <li
                      v-for="url in visibleSources(turn.assistant)"
                      :key="url"
                    >
                      <a
                        :href="url"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span aria-hidden="true">•</span>
                        <strong>{{ sourceHost(url) }}</strong>
                        <span class="muted">/{{ sourceLabel(url) }}</span>
                      </a>
                    </li>
                  </ul>
                </details>
              </div>
            </div>
          </div>

          <div
            v-else-if="
              loading &&
                !turn.assistant &&
                !turn.errorMessage &&
                turn.id === turns[turns.length - 1]?.id
            "
            class="message message--assistant"
          >
            <div class="avatar avatar--assistant">
              ⚾
            </div>
            <div class="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        </article>
      </div>

      <form
        class="composer"
        @submit.prevent="submitText()"
      >
        <textarea
          v-model="input"
          class="composer__input"
          rows="1"
          name="message"
          autocomplete="off"
          placeholder="NPBの試合・選手・成績について質問"
          :disabled="loading"
          @keydown="onKeydown"
        />
        <button
          class="composer__send"
          type="submit"
          :disabled="loading || !input.trim()"
        >
          <span
            v-if="loading"
            class="send-dots"
            aria-label="送信中"
          >
            <span />
            <span />
            <span />
          </span>
          <svg
            v-else
            aria-hidden="true"
            viewBox="0 0 24 24"
          >
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.chat-shell {
  --color-sidebar: #0d1f3c;
  --color-accent: #e8323b;
  --color-accent-surface: #fff0f1;
  --color-bg: #f5f7fa;
  --color-surface: #ffffff;
  --color-border: #e2e8f0;
  --color-text: #0f172a;
  --color-muted: #64748b;
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-columns: 16rem minmax(0, 1fr);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: "Noto Sans JP", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.sidebar {
  height: 100vh;
  padding: 1rem;
  background: var(--color-sidebar);
  color: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  transition: transform 0.2s ease;
}

.sidebar-backdrop {
  display: none;
}

button {
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.brand {
  padding: 0.25rem 0.25rem 0.75rem;
}

.brand__home {
  color: inherit;
  text-decoration: none;
  font-size: 0.82rem;
  color: #cbd5e1;
}

.brand__title {
  margin: 0.25rem 0 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.panel {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.85rem;
  background: rgba(255, 255, 255, 0.06);
}

.panel--quiet {
  margin-top: auto;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
}

.panel__title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #e5e7eb;
}

.status-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: #22c55e;
}

.account-id {
  padding: 0.5rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  color: #cbd5e1;
  font-size: 0.76rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-button {
  margin-top: 0.6rem;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
  cursor: pointer;
}

.text-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.select-field {
  margin-top: 0.6rem;
  display: grid;
  gap: 0.35rem;
  font-size: 0.76rem;
  color: #cbd5e1;
}

.select-field select,
.select-field input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 0.5rem;
  color: #f8fafc;
  background: #1f2937;
  box-sizing: border-box;
}

.account-details {
  display: grid;
  gap: 0.45rem;
  margin: 0.65rem 0 0;
}

.account-details div {
  display: grid;
  gap: 0.18rem;
}

.account-details dt {
  color: #94a3b8;
  font-size: 0.72rem;
}

.account-details dd {
  margin: 0;
  color: #e5e7eb;
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.billing-note {
  margin: 0.6rem 0 0;
  color: #cbd5e1;
  font-size: 0.76rem;
}

.billing-meta {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.65rem;
}

.billing-meta__row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.76rem;
  color: #e5e7eb;
}

.plan-pill,
.intent-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.45rem;
  padding: 0 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.plan-pill--free {
  background: #e0f2fe;
  color: #075985;
}

.plan-pill--pro {
  background: #dcfce7;
  color: #166534;
}

.usage-card {
  margin-top: 0.7rem;
}

.usage-card__top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.78rem;
  color: #e5e7eb;
}

.usage-meter {
  height: 0.45rem;
  margin-top: 0.45rem;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.14);
}

.usage-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
}

.last-query {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.82rem;
}

.muted {
  margin: 0;
  color: #94a3b8;
  font-size: 0.82rem;
}

.workspace {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.92);
}

.topbar h1 {
  margin: 0;
  font-size: 0.95rem;
}

.topbar p {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.82rem;
}

.topbar__usage {
  min-width: 6.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  background: #fff;
  text-align: right;
}

.topbar__usage span {
  display: block;
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 700;
}

.topbar__usage strong {
  font-size: 0.9rem;
}

.topbar__menu {
  display: none;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  cursor: pointer;
  place-items: center;
  gap: 0.22rem;
}

.topbar__menu span {
  display: block;
  width: 1rem;
  height: 2px;
  border-radius: 999px;
  background: var(--color-text);
}

.error-banner {
  margin: 0.75rem 1.25rem 0;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.7rem 0.85rem;
  background: #fef2f2;
  color: #991b1b;
  font-size: 0.88rem;
}

.conversation {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 1.25rem;
}

.empty-state {
  max-width: 48rem;
  margin: 12vh auto 0;
  text-align: center;
}

.empty-state h2 {
  margin: 0 0 1.25rem;
  font-size: clamp(1.55rem, 4vw, 2.5rem);
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.prompt-card {
  min-height: auto;
  border: 1px solid #d7dce3;
  border-left: 3px solid var(--color-accent);
  border-radius: 8px;
  padding: 0.8rem 1rem;
  background: #fff;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
}

.prompt-card:hover {
  border-color: #94a3b8;
  background: #f8fafc;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.turn {
  max-width: 56rem;
  margin: 0 auto 1.25rem;
}

.message {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.message--user {
  max-width: 82%;
  margin-left: auto;
  grid-template-columns: minmax(0, 1fr) 2rem;
}

.message--user .avatar {
  grid-column: 2;
  grid-row: 1;
}

.message--user .bubble {
  grid-column: 1;
  grid-row: 1;
}

.avatar {
  width: 2rem;
  height: 2rem;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
}

.avatar--user {
  background: #1f2937;
  color: #fff;
}

.avatar--assistant {
  background: #e0f2fe;
  color: #075985;
}

.bubble,
.answer {
  border-radius: 8px;
  padding: 0.8rem 0.9rem;
  line-height: 1.6;
  font-size: 0.95rem;
}

.bubble--user {
  background: #1f2937;
  color: #fff;
}

.bubble--error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.answer {
  border: 1px solid #e5e7eb;
  background: #fff;
}

.answer__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  color: #64748b;
  font-size: 0.78rem;
  margin-bottom: 0.65rem;
}

.intent-chip {
  background: var(--color-accent-surface);
  color: var(--color-accent);
}

.answer__summary {
  margin: 0;
  white-space: pre-wrap;
}

.result-section {
  margin-top: 1rem;
  border-top: 1px solid #edf0f4;
  padding-top: 0.9rem;
}

.result-section h3 {
  margin: 0 0 0.6rem;
  font-size: 0.82rem;
  color: #334155;
}

.source-details summary {
  cursor: pointer;
  color: #334155;
  font-size: 0.82rem;
  font-weight: 700;
}

.candidate-list,
.simple-list,
.source-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}

.candidate-list li,
.simple-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid #edf0f4;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
}

.candidate-list small {
  color: #64748b;
}

.event-list {
  margin: 0;
  padding-left: 1.2rem;
}

.event-list li {
  margin-bottom: 0.75rem;
}

.event-list__line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  color: #475569;
  font-size: 0.82rem;
}

.event-list p {
  margin: 0.2rem 0;
}

.event-list a,
.source-list a {
  color: #2563eb;
  word-break: break-all;
  text-decoration: none;
}

.source-list a {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  padding: 0.12rem 0;
}

.source-list span {
  font-size: 0.78rem;
}

.source-list .muted {
  color: var(--color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.data-table th,
.data-table td {
  border-bottom: 1px solid #edf0f4;
  padding: 0.45rem 0.35rem;
  text-align: left;
  white-space: nowrap;
}

.data-table th {
  color: #64748b;
  font-weight: 700;
}

.typing {
  display: inline-flex;
  width: fit-content;
  gap: 0.3rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.8rem 0.9rem;
  background: #fff;
}

.typing span {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: #94a3b8;
  animation: pulse 1s infinite ease-in-out;
}

.typing span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing span:nth-child(3) {
  animation-delay: 0.3s;
}

.composer {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.65rem;
  margin: 0 1.25rem 1rem;
  padding: 0.75rem;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  background: var(--color-surface);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
}

.composer__input {
  min-height: 2.5rem;
  max-height: 9rem;
  resize: vertical;
  border: 0;
  outline: 0;
  font: inherit;
  line-height: 1.5;
}

.composer__send {
  align-self: end;
  width: 2.5rem;
  min-width: 2.5rem;
  height: 2.5rem;
  border: 0;
  border-radius: 50%;
  background: var(--color-accent);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  display: inline-grid;
  place-items: center;
}

.composer__send svg {
  width: 1.15rem;
  height: 1.15rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.send-dots {
  display: inline-flex;
  gap: 0.16rem;
}

.send-dots span {
  width: 0.22rem;
  height: 0.22rem;
  border-radius: 999px;
  background: currentColor;
  animation: pulse 1s infinite ease-in-out;
}

.send-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.send-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

.composer__send:disabled,
.prompt-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@keyframes pulse {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-0.15rem);
  }
}

@media (max-width: 820px) {
  .chat-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 200;
    width: min(16rem, 82vw);
    height: 100vh;
    transform: translateX(-100%);
  }

  .sidebar.is-open {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    z-index: 190;
    display: block;
    border: 0;
    padding: 0;
    background: rgba(15, 23, 42, 0.42);
    cursor: pointer;
  }

  .panel--quiet {
    margin-top: 0;
  }

  .topbar {
    align-items: center;
    gap: 0.7rem;
  }

  .topbar__menu {
    display: inline-grid;
  }

  .topbar p {
    display: none;
  }

  .prompt-grid {
    grid-template-columns: 1fr;
  }

  .message--user {
    max-width: 100%;
  }

  .composer {
    margin: 0 0.75rem 0.75rem;
  }
}
</style>
