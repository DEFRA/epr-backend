import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 500

export function respondWithSystemLogs(result, h, logger) {
  const response = {
    systemLogs: result.systemLogs,
    hasMore: result.hasMore
  }

  if (result.nextCursor) {
    response.nextCursor = result.nextCursor
  }

  logger.info({
    message: `Listed ${result.systemLogs.length} system logs`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
    }
  })

  return h.response(response).code(StatusCodes.OK)
}

export function handleSystemLogsError(error, logger, path) {
  if (error.isBoom) {
    throw error
  }

  logger.error({
    err: error,
    message: `Failure on ${path}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    }
  })

  throw Boom.badImplementation(`Failure on ${path}`)
}
