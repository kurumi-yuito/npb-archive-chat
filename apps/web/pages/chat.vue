<script setup lang="ts">
import type { ChatPlan, ChatResponse, ChatStructuredQuery } from '@npb/schemas'
import { computed, nextTick, ref, watch } from 'vue'
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

function shouldShowResultCount(response: ChatResponse): boolean {
  return response.structured_query.intent !== 'game_detail'
}

function gameDetailCardTitle(response: ChatResponse): string | null {
  if (response.structured_query.intent !== 'game_detail') return null
  const row = response.results.gameDetails[0]
  if (!row) return null
  const score = scoreLineFromLinescore(row.linescoreJson)
  const date = row.date.replaceAll('-', '/')
  const matchup = score || `${displayTeamLabel(row.awayTeamName)} vs ${displayTeamLabel(row.homeTeamName)}`
  return `${date}\n${matchup}`
}

function scoreLineFromLinescore(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const away = parsed.away as Record<string, unknown> | undefined
    const home = parsed.home as Record<string, unknown> | undefined
    const awayTotals = away?.totals as Record<string, unknown> | undefined
    const homeTotals = home?.totals as Record<string, unknown> | undefined
    const awayTeam = typeof away?.team === 'string' ? away.team : ''
    const homeTeam = typeof home?.team === 'string' ? home.team : ''
    const awayRuns = Number(awayTotals?.runs)
    const homeRuns = Number(homeTotals?.runs)
    if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns)) return null
    return `${displayTeamLabel(awayTeam)} ${awayRuns}-${homeRuns} ${displayTeamLabel(homeTeam)}`
  } catch {
    return null
  }
}

function displayTeamLabel(team: string): string {
  const aliases: Record<string, string> = {
    Yomiuri: '巨人',
    DeNA: 'DeNA',
    Hanshin: '阪神',
    Hiroshima: '広島',
    Chunichi: '中日',
    Yakult: 'ヤクルト',
    'Nippon-Ham': '日本ハム',
    Rakuten: '楽天',
    Seibu: '西武',
    Lotte: 'ロッテ',
    ORIX: 'オリックス',
    SoftBank: 'ソフトバンク',
  }
  return aliases[team] ?? team
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

function visibleSuggestedQuestions(response: ChatResponse): string[] {
  return response.answer.suggested_questions?.slice(0, 3) ?? []
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
  await scrollToLatest()
}

async function scrollToLatest(behavior: 'auto' | 'smooth' = 'smooth') {
  await nextTick()
  conversationRef.value?.scrollTo({ top: conversationRef.value.scrollHeight, behavior })
}

watch(
  () => turns.value.map((turn) => `${turn.id}:${turn.assistant ? 'a' : ''}:${turn.errorMessage ?? ''}`).join('|'),
  () => {
    void scrollToLatest()
  },
)

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
    <!-- SP: sidebar overlay backdrop -->
    <div
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      role="presentation"
      @click="toggleSidebar"
    />

    <aside
      class="sidebar"
      :class="{ 'is-open': sidebarOpen }"
      aria-label="ユーザー設定"
    >
      <div class="brand">
        <NuxtLink class="brand__link" to="/">NPB Archive</NuxtLink>
        <p class="brand__tagline">検索チャット</p>
      </div>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">アカウント</h2>
          <span class="status-dot" aria-hidden="true" />
        </div>
        <div class="account-id" :title="userId || 'local'">
          {{ accountInfo?.authProvider === 'google' ? 'Google アカウント' : 'ゲスト' }}
        </div>
        <div v-if="userId" class="account-id account-id--sub" :title="userId">
          {{ userId }}
        </div>
        <dl v-if="isGoogleAuthenticated" class="account-details">
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
        <button v-else class="text-button" type="button" @click="logout">
          ログアウト
        </button>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">プラン</h2>
          <span class="plan-pill" :class="`plan-pill--${plan}`">{{ plan }}</span>
        </div>
        <label class="select-field">
          <span>現在のプラン</span>
          <select :value="plan" :disabled="accountSaving" @change="onPlanChange">
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <p v-if="!isGoogleAuthenticated" class="billing-note">
          Pro は Google ログイン後に開始できます。
        </p>
        <div v-if="accountInfo?.billingPlan" class="billing-meta">
          <div class="billing-meta__row">
            <span>料金</span>
            <strong>{{ accountInfo.billingPlan.monthlyPriceYen.toLocaleString('ja-JP') }}円 / 月</strong>
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
          <div class="usage-meter" aria-hidden="true">
            <span :style="usageMeterStyle" />
          </div>
        </div>
      </section>

      <section class="panel panel--quiet">
        <h2 class="panel__title">直近の検索</h2>
        <p v-if="!lastAssistant" class="muted">まだありません</p>
        <template v-else>
          <div class="last-query">
            <span>{{ structuredQueryLabel(lastAssistant.structured_query) }}</span>
            <strong>{{ gameDetailCardTitle(lastAssistant) ?? `${lastAssistant.answer.result_count}件` }}</strong>
          </div>
        </template>
      </section>
    </aside>

    <section class="workspace" aria-label="チャット">
      <header class="topbar">
        <button class="topbar__menu" type="button" aria-label="メニュー" @click="toggleSidebar">
          <span /><span /><span />
        </button>
        <h1 class="topbar__title">NPBアーカイブ</h1>
        <div class="topbar__usage">
          <span>{{ plan.toUpperCase() }}</span>
          <strong>{{ usageLabel }}</strong>
        </div>
      </header>

      <div v-if="lastError" class="error-banner" role="alert">{{ lastError }}</div>

      <div ref="conversationRef" class="conversation">
        <!-- Empty state -->
        <section v-if="turns.length === 0" class="empty-state">
          <div class="empty-state__icon">⚾</div>
          <h2 class="empty-state__heading">何を調べますか？</h2>
          <p class="empty-state__sub">2016年以降のNPB試合・選手・成績をDBから即答します</p>
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

        <!-- Chat turns -->
        <article v-for="turn in turns" :key="turn.id" class="turn">
          <!-- User message -->
          <div class="message message--user">
            <div class="bubble bubble--user">{{ turn.userMessage }}</div>
            <div class="avatar avatar--user" aria-hidden="true">U</div>
          </div>

          <!-- Error -->
          <div v-if="turn.errorMessage" class="message message--assistant">
            <div class="avatar avatar--assistant" aria-hidden="true">⚾</div>
            <div class="bubble bubble--error">{{ turn.errorMessage }}</div>
          </div>

          <!-- Assistant answer -->
          <div v-else-if="turn.assistant" class="message message--assistant">
            <div class="avatar avatar--assistant" aria-hidden="true">⚾</div>
            <div class="answer">
              <div class="answer__meta">
                <span class="intent-chip">{{ structuredQueryLabel(turn.assistant.structured_query) }}</span>
                <span
                  v-if="gameDetailCardTitle(turn.assistant)"
                  class="answer__detail-title"
                >{{ gameDetailCardTitle(turn.assistant) }}</span>
                <span v-else-if="shouldShowResultCount(turn.assistant)" class="answer__count">
                  {{ turn.assistant.answer.result_count }}件
                </span>
                <span v-if="turn.assistant.answer.remaining_count" class="answer__count">
                  省略 {{ turn.assistant.answer.remaining_count }}件
                </span>
              </div>

              <p class="answer__summary">{{ turn.assistant.answer.summary }}</p>

              <!-- Ambiguous player candidates -->
              <div v-if="turn.assistant.answer.resolved_player?.status === 'ambiguous'" class="result-section">
                <h3 class="result-title">候補選手</h3>
                <ul class="candidate-list">
                  <li
                    v-for="candidate in turn.assistant.answer.resolved_player.candidates"
                    :key="`${candidate.player_id}-${candidate.name}-${candidate.primary_team}`"
                  >
                    <span class="candidate-name">{{ candidate.name }}</span>
                    <small class="candidate-meta">
                      <template v-if="candidate.primary_team">{{ candidate.primary_team }}</template>
                    </small>
                  </li>
                </ul>
              </div>

              <!-- Events -->
              <div v-if="turn.assistant.results.events.length" class="result-section">
                <h3 class="result-title">イベント</h3>
                <ol class="event-list">
                  <li
                    v-for="event in visibleEvents(turn.assistant)"
                    :key="`${event.gameId}-${event.sequence}`"
                    class="event-item"
                  >
                    <div class="event-item__meta">
                      <strong>{{ event.gameDate }}</strong>
                      <span>{{ event.inning }}回{{ inningHalfLabel(event.half) }}</span>
                    </div>
                    <p class="event-item__text">
                      <template v-if="event.pitcherName">{{ event.pitcherName }}から</template>{{ event.resultText }}
                    </p>
                    <a
                      v-if="event.sourceUrl"
                      :href="event.sourceUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="event-item__link"
                    >{{ sourceLabel(event.sourceUrl) }}</a>
                  </li>
                </ol>
              </div>

              <!-- Batting stats -->
              <div v-if="turn.assistant.results.batting.length" class="result-section">
                <h3 class="result-title">打撃成績</h3>
                <div class="table-wrap">
                  <table class="data-table">
                    <thead>
                      <tr><th>年</th><th>チーム</th><th>選手</th><th>打数</th><th>安打</th><th>打点</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in turn.assistant.results.batting" :key="`${row.gameId}-${row.playerName}`">
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

              <!-- Affiliations -->
              <div v-if="turn.assistant.results.affiliations.length" class="result-section">
                <h3 class="result-title">所属</h3>
                <ul class="simple-list">
                  <li v-for="row in turn.assistant.results.affiliations" :key="`${row.year}-${row.team}-${row.playerId}`">
                    {{ row.year }}年 {{ row.playerName }} / {{ row.team }}
                  </li>
                </ul>
              </div>

              <!-- Sources: collapsed by default -->
              <div v-if="visibleSources(turn.assistant).length" class="result-section">
                <details class="source-details">
                  <summary class="source-details__toggle">
                    ソース ({{ visibleSources(turn.assistant).length }}件)
                  </summary>
                  <ul class="source-list">
                    <li v-for="url in visibleSources(turn.assistant)" :key="url">
                      <a :href="url" target="_blank" rel="noopener noreferrer" class="source-item">
                        <span class="source-item__host">{{ sourceHost(url) }}</span>
                        <span class="source-item__path">{{ sourceLabel(url) }}</span>
                      </a>
                    </li>
                  </ul>
                </details>
              </div>

              <div v-if="visibleSuggestedQuestions(turn.assistant).length" class="result-section related-questions">
                <h3 class="result-title">関連する質問</h3>
                <div class="related-questions__list">
                  <button
                    v-for="question in visibleSuggestedQuestions(turn.assistant)"
                    :key="question"
                    class="related-questions__item"
                    type="button"
                    :disabled="loading"
                    @click="submitText(question)"
                  >
                    <span aria-hidden="true">□</span>
                    <span>{{ question }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div
            v-else-if="loading && !turn.assistant && !turn.errorMessage && turn.id === turns[turns.length - 1]?.id"
            class="message message--assistant"
          >
            <div class="avatar avatar--assistant" aria-hidden="true">⚾</div>
            <div class="typing">
              <span /><span /><span />
            </div>
          </div>
        </article>
      </div>

      <!-- Composer -->
      <form class="composer" @submit.prevent="submitText()">
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
        <button class="composer__send" type="submit" :disabled="loading || !input.trim()" aria-label="送信">
          <span v-if="loading" class="send-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5m0 0-6 6m6-6 6 6" />
          </svg>
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
/* ── Design tokens ───────────────────────────────────── */
.chat-shell {
  --c-sidebar:        #1e1b4b;
  --c-sidebar-border: rgba(255, 255, 255, 0.08);
  --c-accent:         #4f46e5;
  --c-accent-dim:     rgba(79, 70, 229, 0.1);
  --c-bg:             #f5f5f7;
  --c-surface:        #ffffff;
  --c-border:         #e2e8f0;
  --c-text:           #0f172a;
  --c-muted:          #64748b;
  --c-user-bubble:    #1e1b4b;
  --radius:           10px;
  --sidebar-w:        16rem;
}

/* ── Shell ──────────────────────────────────────────── */
.chat-shell {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  background: var(--c-bg);
  color: var(--c-text);
  font-family: Inter, "Hiragino Sans", "Hiragino Kaku Gothic ProN", Meiryo, ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.6;
}

/* ── Sidebar ────────────────────────────────────────── */
.sidebar {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 0.75rem 1.5rem;
  background: var(--c-sidebar);
  color: #f1f5f9;
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-backdrop {
  display: none;
}

/* Brand */
.brand {
  padding: 0.5rem 0.25rem 0.75rem;
  border-bottom: 1px solid var(--c-sidebar-border);
  margin-bottom: 0.25rem;
}

.brand__link {
  display: block;
  font-size: 1.1rem;
  font-weight: 800;
  color: #f1f5f9;
  text-decoration: none;
  letter-spacing: -0.01em;
}

.brand__tagline {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: #94a3b8;
}

/* Panel */
.panel {
  border-radius: var(--radius);
  padding: 0.9rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--c-sidebar-border);
}

.panel--quiet {
  margin-top: auto;
  background: transparent;
  border-color: transparent;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.panel__title {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
}

/* Status dot */
.status-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}

/* Account */
.account-id {
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  color: #cbd5e1;
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-id--sub {
  margin-top: 0.3rem;
  font-size: 0.68rem;
  color: #64748b;
}

.account-details {
  display: grid;
  gap: 0.4rem;
  margin: 0.6rem 0 0;
}

.account-details div {
  display: grid;
  gap: 0.1rem;
}

.account-details dt {
  font-size: 0.68rem;
  color: #94a3b8;
}

.account-details dd {
  margin: 0;
  font-size: 0.75rem;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Buttons */
.text-button {
  display: block;
  width: 100%;
  margin-top: 0.6rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.07);
  color: #f1f5f9;
  font-size: 0.82rem;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s;
}

.text-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.text-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Select */
.select-field {
  display: grid;
  gap: 0.3rem;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
}

.select-field select {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 0.82rem;
  box-sizing: border-box;
}

/* Plan pill */
.plan-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.plan-pill--free {
  background: rgba(14, 165, 233, 0.2);
  color: #38bdf8;
}

.plan-pill--pro {
  background: rgba(232, 50, 59, 0.2);
  color: #fb7185;
}

/* Billing */
.billing-note {
  margin: 0.5rem 0 0;
  font-size: 0.74rem;
  color: #64748b;
}

.billing-meta {
  display: grid;
  gap: 0.3rem;
  margin-top: 0.6rem;
}

.billing-meta__row {
  display: flex;
  justify-content: space-between;
  font-size: 0.74rem;
  color: #cbd5e1;
}

/* Usage */
.usage-card {
  margin-top: 0.65rem;
}

.usage-card__top {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #e2e8f0;
}

.usage-meter {
  height: 4px;
  margin-top: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.usage-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--c-accent);
  transition: width 0.4s ease;
}

/* Last query */
.last-query {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #e2e8f0;
}

.muted {
  margin: 0;
  font-size: 0.8rem;
  color: #475569;
}

/* ── Workspace ──────────────────────────────────────── */
.workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

/* ── Topbar ─────────────────────────────────────────── */
.topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.25rem;
  height: 3.25rem;
  flex-shrink: 0;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
}

.topbar__title {
  flex: 1;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--c-text);
}

.topbar__usage {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.75rem;
  border: 1px solid var(--c-border);
  border-radius: 999px;
  background: var(--c-bg);
  font-size: 0.75rem;
  white-space: nowrap;
}

.topbar__usage span {
  color: var(--c-muted);
}

.topbar__usage strong {
  color: var(--c-text);
}

/* Hamburger: hidden on desktop, shown on SP */
.topbar__menu {
  display: none;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--c-border);
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.topbar__menu span {
  display: block;
  width: 1rem;
  height: 2px;
  border-radius: 999px;
  background: var(--c-text);
}

/* ── Error banner ───────────────────────────────────── */
.error-banner {
  margin: 0.75rem 1.25rem 0;
  padding: 0.65rem 0.9rem;
  border: 1px solid #fecaca;
  border-radius: var(--radius);
  background: #fef2f2;
  color: #991b1b;
  font-size: 0.85rem;
  flex-shrink: 0;
}

/* ── Conversation ───────────────────────────────────── */
.conversation {
  flex: 1 1 0;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
  padding: 1.5rem 1.25rem 2rem;
}

/* ── Empty state ────────────────────────────────────── */
.empty-state {
  max-width: 44rem;
  margin: 8vh auto 0;
  text-align: center;
  padding: 0 0.5rem;
}

.empty-state__icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.empty-state__heading {
  margin: 0 0 0.5rem;
  font-size: clamp(1.4rem, 4vw, 2rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.empty-state__sub {
  margin: 0 0 1.5rem;
  color: var(--c-muted);
  font-size: 0.9rem;
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.prompt-card {
  position: relative;
  overflow: hidden;
  padding: 0.85rem 1rem;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
  text-align: left;
  font-size: 0.875rem;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
}

.prompt-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--c-accent);
}

.prompt-card:hover {
  border-color: #b4bec8;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}

.prompt-card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* ── Turn & messages ────────────────────────────────── */
.turn {
  max-width: 52rem;
  margin: 0 auto 0.5rem;
}

.message {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.message--user {
  flex-direction: row-reverse;
  max-width: 80%;
  margin-left: auto;
}

/* Avatar */
.avatar {
  width: 1.9rem;
  height: 1.9rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.78rem;
  font-weight: 700;
  user-select: none;
}

.avatar--user {
  background: var(--c-user-bubble);
  color: #fff;
  font-size: 0.65rem;
}

.avatar--assistant {
  background: var(--c-accent-dim);
  font-size: 0.95rem;
}

/* Bubbles */
.bubble {
  border-radius: var(--radius);
  padding: 0.7rem 0.95rem;
  font-size: 0.9rem;
  line-height: 1.65;
}

.bubble--user {
  background: var(--c-user-bubble);
  color: #fff;
  border-radius: var(--radius) var(--radius) 4px var(--radius);
}

.bubble--error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

/* Answer block */
.answer {
  flex: 1;
  min-width: 0;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 4px var(--radius) var(--radius) var(--radius);
  padding: 0.9rem 1rem;
}

.answer__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.6rem;
}

.intent-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--c-accent-dim);
  color: var(--c-accent);
  font-size: 0.72rem;
  font-weight: 700;
}

.answer__count {
  font-size: 0.78rem;
  color: var(--c-muted);
}

.answer__detail-title {
  white-space: pre-line;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--c-text);
}

.answer__summary {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.9rem;
}

.related-questions__list {
  display: grid;
  gap: 0.45rem;
}

.related-questions__item {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--c-border);
  border-radius: 7px;
  background: var(--c-surface);
  color: var(--c-text);
  font: inherit;
  font-size: 0.85rem;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.related-questions__item:hover:not(:disabled) {
  border-color: var(--c-accent);
  background: var(--c-accent-dim);
}

.related-questions__item:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

/* Result sections */
.result-section {
  margin-top: 0.9rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--c-border);
}

.result-title {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--c-muted);
}

/* Candidate list */
.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}

.candidate-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--c-border);
  border-radius: 7px;
  font-size: 0.85rem;
}

.candidate-meta {
  color: var(--c-muted);
  font-size: 0.78rem;
}

/* Event list */
.event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.event-item {
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--c-border);
  border-radius: 7px;
  font-size: 0.85rem;
}

.event-item__meta {
  display: flex;
  gap: 0.6rem;
  color: var(--c-muted);
  font-size: 0.78rem;
  margin-bottom: 0.2rem;
}

.event-item__text {
  margin: 0;
}

.event-item__link {
  display: inline-block;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--c-accent);
  text-decoration: none;
  word-break: break-all;
}

.event-item__link:hover {
  text-decoration: underline;
}

/* Simple list */
.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
}

/* Source */
.source-details__toggle {
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--c-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  user-select: none;
}

.source-details__toggle:hover {
  color: var(--c-text);
}

.source-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}

.source-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  text-decoration: none;
  padding: 0.2rem 0;
  min-width: 0;
}

.source-item__host {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  flex-shrink: 0;
}

.source-item__path {
  font-size: 0.75rem;
  color: var(--c-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.source-item:hover .source-item__host {
  color: var(--c-accent);
}

/* Data table */
.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.data-table th,
.data-table td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--c-border);
  text-align: left;
  white-space: nowrap;
}

.data-table th {
  color: var(--c-muted);
  font-weight: 700;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.data-table tbody tr:hover {
  background: var(--c-bg);
}

/* Typing indicator */
.typing {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.75rem 1rem;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 4px var(--radius) var(--radius) var(--radius);
}

.typing span {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  background: #94a3b8;
  animation: typing-pulse 1.2s infinite ease-in-out;
}

.typing span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing-pulse {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* ── Composer ───────────────────────────────────────── */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  margin: 0;
  padding: 0.6rem 0.6rem 0.6rem 1rem;
  padding-bottom: calc(0.6rem + env(safe-area-inset-bottom));
  border: 0;
  border-top: 1px solid var(--c-border);
  border-radius: 0;
  background: var(--c-surface);
  box-shadow: 0 -2px 20px rgba(15, 23, 42, 0.08);
  flex: 0 0 auto;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.composer:focus-within {
  box-shadow: 0 -2px 20px rgba(15, 23, 42, 0.12), 0 0 0 2px rgba(79, 70, 229, 0.15);
}

.composer__input {
  flex: 1;
  min-height: 1.5rem;
  max-height: 8rem;
  resize: none;
  border: 0;
  outline: 0;
  font: inherit;
  font-size: 0.93rem;
  line-height: 1.5;
  background: transparent;
  color: var(--c-text);
}

.composer__input::placeholder {
  color: #94a3b8;
}

.composer__send {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  background: var(--c-accent);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s, opacity 0.15s;
}

.composer__send:hover:not(:disabled) {
  background: #4338ca;
  transform: scale(1.05);
}

.composer__send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.composer__send svg {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.send-dots {
  display: flex;
  align-items: center;
  gap: 3px;
}

.send-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fff;
  animation: typing-pulse 1.2s infinite ease-in-out;
}

.send-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.send-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

/* ── Responsive (SP ≤ 820px) ────────────────────────── */
@media (max-width: 820px) {
  .chat-shell {
    grid-template-columns: 1fr;
  }

  /* Sidebar becomes a fixed left drawer */
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(var(--sidebar-w), 85vw);
    z-index: 300;
    transform: translateX(-100%);
    box-shadow: none;
  }

  .sidebar.is-open {
    transform: translateX(0);
    box-shadow: 8px 0 32px rgba(0, 0, 0, 0.3);
  }

  /* Backdrop */
  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
  }

  /* Show hamburger */
  .topbar__menu {
    display: flex;
  }

  .panel--quiet {
    margin-top: 0;
  }

  .prompt-grid {
    grid-template-columns: 1fr;
  }

  .message--user {
    max-width: 90%;
  }

  .composer {
    margin: 0;
  }

  .conversation {
    padding: 1rem 0.85rem 1.5rem;
  }
}
</style>
