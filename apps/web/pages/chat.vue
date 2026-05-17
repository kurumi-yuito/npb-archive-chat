<script setup lang="ts">
import type { ChatPlan, ChatResponse, ChatStructuredQuery } from '@npb/schemas'
import { computed, nextTick, ref } from 'vue'
import { useChat } from '~/composables/useChat'

defineOptions({ name: 'ChatPage' })

const input = ref('')
const conversationRef = ref<HTMLElement | null>(null)
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
</script>

<template>
  <main class="chat-shell">
    <aside
      class="sidebar"
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
        <p class="billing-note">
          課金状態: {{ accountInfo?.billingProvider ?? 'internal' }} /
          {{ accountInfo?.billingStatus ?? 'active' }}
        </p>
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
          <details class="query-details">
            <summary>query plan</summary>
            <pre>{{ JSON.stringify(lastAssistant.structured_query, null, 2) }}</pre>
          </details>
        </template>
      </section>
    </aside>

    <section
      class="workspace"
      aria-label="チャット"
    >
      <header class="topbar">
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
              U
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
              AI
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
              AI
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
                <h3>ソース</h3>
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
                      <span>{{ sourceHost(url) }}</span>
                      {{ sourceLabel(url) }}
                    </a>
                  </li>
                </ul>
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
              AI
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
          {{ loading ? '...' : '送信' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.chat-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 18rem minmax(0, 1fr);
  background: #f6f7f9;
  color: #16181d;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.sidebar {
  min-height: 100vh;
  padding: 1rem;
  background: #111827;
  color: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
  background: #38bdf8;
}

.last-query {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.82rem;
}

.query-details {
  margin-top: 0.65rem;
  font-size: 0.76rem;
  color: #cbd5e1;
}

.query-details pre {
  max-height: 12rem;
  overflow: auto;
  padding: 0.55rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
}

.muted {
  margin: 0;
  color: #94a3b8;
  font-size: 0.82rem;
}

.workspace {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
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
  font-size: 1.05rem;
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
  overflow: auto;
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
  min-height: 4rem;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  padding: 0.85rem;
  background: #fff;
  color: #1f2937;
  text-align: left;
  cursor: pointer;
  font-size: 0.9rem;
}

.prompt-card:hover {
  border-color: #94a3b8;
  background: #f8fafc;
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
  background: #eff6ff;
  color: #1d4ed8;
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
  display: grid;
  gap: 0.15rem;
  border: 1px solid #edf0f4;
  border-radius: 6px;
  padding: 0.55rem 0.6rem;
}

.source-list span {
  color: #64748b;
  font-size: 0.75rem;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.65rem;
  margin: 0 1.25rem 1rem;
  padding: 0.75rem;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
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
  min-width: 4.5rem;
  height: 2.5rem;
  border: 0;
  border-radius: 7px;
  background: #111827;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
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
    min-height: auto;
    display: grid;
    grid-template-columns: 1fr;
  }

  .panel--quiet {
    margin-top: 0;
  }

  .topbar {
    align-items: flex-start;
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
