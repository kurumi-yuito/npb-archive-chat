import { createError } from 'h3'

export function createPublicApiError(
  statusCode: number,
  code: string,
  statusMessage: string,
  data: Record<string, unknown> = {},
) {
  return createError({
    statusCode,
    statusMessage,
    data: {
      code,
      ...data,
    },
  })
}
