import { describe, expect, it } from 'vitest'
import {
  extractSafeFallbackErrorMessage,
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
        month: '2026-05',
        used: 9,
        limit: 9,
        remaining: 0,
      }),
    ).toBe('今月のチャットは上限（9回）に達しました（2026-05）。')
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
})
