import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { StatusCodes } from 'http-status-codes'

export const authFailureLogger = {
  plugin: {
    name: 'auth-failure-logger',
    version: '1.0.0',
    register: (server) => {
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        if (
          response.isBoom &&
          response.output.statusCode === StatusCodes.UNAUTHORIZED
        ) {
          request.logger.warn({
            message: response.message,
            error: response,
            event: {
              category: LOGGING_EVENT_CATEGORIES.AUTH,
              action: LOGGING_EVENT_ACTIONS.AUTH_FAILED
            },
            path: request.path,
            method: request.method
          })
        }

        return h.continue
      })
    }
  }
}
