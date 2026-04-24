import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

const SERVER_ERROR_THRESHOLD = 500

export const boomErrorLogger = {
  plugin: {
    name: 'boom-error-logger',
    version: '1.0.0',
    /**
     * @param {import('#common/hapi-types.js').HapiServer} server
     */
    register: (server) => {
      server.ext(
        'onPreResponse',
        /**
         * @param {import('#common/hapi-types.js').HapiRequest} request
         * @param {import('#common/hapi-types.js').HapiResponseToolkit} h
         */
        (request, h) => {
          const response = request.response

          if (!('isBoom' in response) || !response.isBoom) {
            return h.continue
          }

          const boom = /** @type {import('@hapi/boom').Boom} */ (response)
          const statusCode = boom.output.statusCode

          // 401 is already logged by authFailureLogger; skip to avoid duplicates
          if (statusCode === StatusCodes.UNAUTHORIZED) {
            return h.continue
          }

          const isServerError = statusCode >= SERVER_ERROR_THRESHOLD
          const level = isServerError ? 'error' : 'warn'
          const action = isServerError
            ? LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
            : LOGGING_EVENT_ACTIONS.REQUEST_FAILURE

          // Boom messages are PII-safe by convention (see PAE-1384). We do not
          // read boom.output.payload (Joi validation echoes input), boom.data
          // (arbitrary developer-attached payload), or boom.stack (the first
          // line of a stack trace echoes the error message, which can leak
          // PII when an upstream Error was constructed from user input).
          request.logger[level]({
            message: boom.message,
            error: {
              code: String(statusCode),
              id: request.info.id,
              message: boom.message,
              type: boom.output.payload.error
            },
            event: {
              category: LOGGING_EVENT_CATEGORIES.HTTP,
              action,
              kind: 'event',
              outcome: 'failure'
            },
            http: {
              response: {
                status_code: statusCode
              }
            }
          })

          return h.continue
        }
      )
    }
  }
}
