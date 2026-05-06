import { createError } from 'h3'
import { ZodError } from 'zod'
import { createSearchService } from '../../services/search-service'
import { parseSearchEventsQuery } from '../../utils/parse-search-query'
import { getServerDatabase } from '../../utils/server-database'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  try {
    const filters = parseSearchEventsQuery(getQuery(event))
    const database = await getServerDatabase(event, config.npbSqlitePath)
    const service = createSearchService(database)
    return await service.searchEvents(filters)
  } catch (error) {
    if (error instanceof ZodError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid query parameters',
        data: error.flatten(),
      })
    }
    if (error instanceof Error && error.message.includes('not set')) {
      throw createError({ statusCode: 503, statusMessage: error.message })
    }
    throw error
  }
})
