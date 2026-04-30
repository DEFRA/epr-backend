import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

/**
 * @import { HapiServer, HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { CdpBoom } from '#common/helpers/logging/cdp-boom.js'
 */

const SERVER_ERROR_THRESHOLD = 500

export const boomErrorLogger = {
  plugin: {
    name: 'boom-error-logger',
    version: '1.0.0',
    /** @param {HapiServer} server */
    register: (server) => {
      server.ext(
        'onPreResponse',
        /**
         * @param {HapiRequest} request
         * @param {HapiResponseToolkit} h
         */
        (request, h) => {
          const response = request.response

          if (!('isBoom' in response) || !response.isBoom) {
            return h.continue
          }

          const boom = /** @type {CdpBoom} */ (response)
          const statusCode = boom.output.statusCode

          // 401 is already logged by authFailureLogger; skip to avoid duplicates
          if (statusCode === StatusCodes.UNAUTHORIZED) {
            return h.continue
          }

          const isServerError = statusCode >= SERVER_ERROR_THRESHOLD
          const level = isServerError ? 'error' : 'warn'
          const defaultAction = isServerError
            ? LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
            : LOGGING_EVENT_ACTIONS.REQUEST_FAILURE

          // Boom messages are PII-safe by convention (see PAE-1384). We do not
          // read boom.output.payload (Joi validation echoes input) or boom.data
          // (arbitrary developer-attached payload). boom.stack is included
          // here so non-prod debugging has frame info; the logger-options
          // formatter strips error.stack_trace when cdpEnvironment is prod.
          //
          // Helpers may enrich a Boom with `code` (semantic classifier) and
          // `event` fields (action/reason/reference) for indexed search — see
          // CdpBoom. These override the defaults when present.
          request.logger[level]({
            message: boom.message,
            error: {
              code: boom.code ?? String(statusCode),
              id: request.info.id,
              message: boom.message,
              stack_trace: boom.stack,
              type: boom.output.payload.error
            },
            event: {
              category: LOGGING_EVENT_CATEGORIES.HTTP,
              action: defaultAction,
              kind: 'event',
              outcome: 'failure',
              ...(boom.event ?? {})
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
