import { describe, expect, it } from 'vitest'
import {
  extractSafeFallbackErrorMessage,
  usageRefreshDelayMs,
  userFacingAccountError,
  userFacingBillingError,
  userFacingChatError,
} from '../composables/useChat'

describe('chat UI error messages', () => {
  it('does not expose internal chat API error text to users', () => {
    expect(userFacingChatError(400)).toBe('質問を処理できませんでした。入力を変えて再度お試しください。')
    expect(userFacingChatError(500)).toBe('回答の生成中に問題が発生しました。時間をおいて再度お試しください。')
    expect(userFacingChatError(503)).toBe('現在チャットを利用できません。時間をおいて再度お試しください。')
  })

  it('keeps usage limit messaging specific without using backend status messages', () => {
    expect(
      userFacingChatError(429, {
        plan: 'free',
        timezone: 'Asia/Tokyo',
        asOf: '2026-08-08T12:00:00+09:00',
        limit: 10,
        remaining: 0,
        refillIntervalMinutes: 120,
        nextTokenAt: '2026-08-08T13:42:00+09:00',
        fullAt: '2026-08-09T08:00:00+09:00',
      }),
    ).toBe('質問回数を使い切りました。残り0回。次の質問まで1時間42分です。')
  })

  it('does not expose thrown internal Error messages without an explicit safe status', () => {
    expect(extractSafeFallbackErrorMessage(new Error('Invalid chat request'))).toBe(
      '処理中に問題が発生しました。時間をおいて再度お試しください。',
    )
    expect(extractSafeFallbackErrorMessage(new TypeError('Failed to fetch'))).toBe(
      '通信に失敗しました。接続状態を確認してください。',
    )
  })

  it('uses fixed user-facing messages for account and billing failures', () => {
    expect(userFacingAccountError(400)).toBe('アカウント情報を更新できませんでした。')
    expect(userFacingBillingError(400)).toBe('プランを変更できませんでした。時間をおいて再度お試しください。')
    expect(userFacingBillingError(401)).toBe('Pro を開始するには Google ログインが必要です。')
  })

  it('refreshes usage just after the next token recovery instant', () => {
    expect(usageRefreshDelayMs({
      plan: 'free',
      timezone: 'Asia/Tokyo',
      asOf: '2026-08-08T12:00:00+09:00',
      limit: 10,
      remaining: 0,
      refillIntervalMinutes: 120,
      nextTokenAt: '2026-08-08T14:00:00+09:00',
      fullAt: '2026-08-09T08:00:00+09:00',
    }, Date.parse('2026-08-08T12:00:00+09:00'))).toBe(7_200_250)
  })
})
