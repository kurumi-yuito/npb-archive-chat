type QaFixtureModeInput = {
  modeHeader: string | null | undefined
  tokenHeader: string | null | undefined
  expectedToken: string | null | undefined
}

export type QaFixtureModeResult =
  | { enabled: false; error: null }
  | { enabled: false; error: 'disabled' | 'forbidden' }
  | { enabled: true; error: null }

export function resolveQaFixtureMode({
  modeHeader,
  tokenHeader,
  expectedToken,
}: QaFixtureModeInput): QaFixtureModeResult {
  if (modeHeader !== 'fixture') {
    return { enabled: false, error: null }
  }
  if (!expectedToken) {
    return { enabled: false, error: 'disabled' }
  }
  if (tokenHeader !== expectedToken) {
    return { enabled: false, error: 'forbidden' }
  }
  return { enabled: true, error: null }
}
