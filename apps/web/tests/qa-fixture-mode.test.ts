import { describe, expect, it } from 'vitest'
import { resolveQaFixtureMode } from '../server/utils/qa-fixture-mode'

describe('resolveQaFixtureMode', () => {
  it('leaves normal requests disabled without error', () => {
    expect(resolveQaFixtureMode({
      modeHeader: null,
      tokenHeader: null,
      expectedToken: 'secret',
    })).toEqual({ enabled: false, error: null })
  })

  it('rejects fixture mode when the server token is not configured', () => {
    expect(resolveQaFixtureMode({
      modeHeader: 'fixture',
      tokenHeader: 'secret',
      expectedToken: '',
    })).toEqual({ enabled: false, error: 'disabled' })
  })

  it('rejects fixture mode when the token does not match', () => {
    expect(resolveQaFixtureMode({
      modeHeader: 'fixture',
      tokenHeader: 'wrong',
      expectedToken: 'secret',
    })).toEqual({ enabled: false, error: 'forbidden' })
  })

  it('enables fixture mode only with a matching token', () => {
    expect(resolveQaFixtureMode({
      modeHeader: 'fixture',
      tokenHeader: 'secret',
      expectedToken: 'secret',
    })).toEqual({ enabled: true, error: null })
  })
})
