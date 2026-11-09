import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { queryContractSchema } from '@npb/schemas'
import { issuePlayerSelectionChallenge, verifyPlayerSelectionChallenge } from '../server/utils/player-selection-challenge'

const contract = queryContractSchema.parse(JSON.parse(readFileSync(new URL('../../../docs/eval-query-contracts.json', import.meta.url), 'utf8')).cases[0].meaning)
const issued = { secret: 'unit-selection-key', userId: 'guest-test', message: '元の質問', mention: '山田', candidateIds: ['91895133', '11815114'], contract, nowSeconds: 1000 }
const selected = { secret: issued.secret, userId: issued.userId, message: issued.message, mention: issued.mention, playerId: '91895133', nowSeconds: 1100 }

describe('bound player selection challenges', () => {
  it('returns the original verified semantic contract only for the owning user, exact question and eligible choice', async () => {
    const token = await issuePlayerSelectionChallenge(issued)
    expect(await verifyPlayerSelectionChallenge({ ...selected, token })).toEqual(contract)
    for (const patch of [{ userId: 'another-user' }, { message: '別年度の質問' }, { mention: '別選手' }, { playerId: '99999999' }]) {
      await expect(verifyPlayerSelectionChallenge({ ...selected, ...patch, token })).rejects.toThrow('もう一度検索')
    }
  })
  it('rejects tampering, another signing key, expiration and malformed tokens', async () => {
    const token = await issuePlayerSelectionChallenge(issued)
    const [payload, signature] = token.split('.')
    const tampered = `${payload!.startsWith('a') ? 'b' : 'a'}${payload!.slice(1)}.${signature}`
    for (const patch of [{ token: tampered }, { token, secret: 'another-key' }, { token, nowSeconds: 1900 }, { token: 'bad' }, { token: 'x'.repeat(48001) }]) {
      await expect(verifyPlayerSelectionChallenge({ ...selected, ...patch })).rejects.toThrow('もう一度検索')
    }
  })
})
