import { StatusCodes } from 'http-status-codes'

import { LOGGING_EVENT_CATEGORIES } from '#common/enums/event.js'

/**
 * @import { HapiServer, HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import Boom from '@hapi/boom'
 */

const defaultEvent = {
  category: LOGGING_EVENT_CATEGORIES.HTTP,
  outcome: 'failure'
}

export const boomResponseLogger = {
  plugin: {
    name: 'boom-response-logger',
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

          const boom = /** @type {Boom.Boom & { event?: object }} */ (response)
          const { statusCode } = boom.output

          if (
            statusCode < StatusCodes.BAD_REQUEST ||
            statusCode === StatusCodes.UNAUTHORIZED
          ) {
            return h.continue
          }

          const level =
            statusCode >= StatusCodes.INTERNAL_SERVER_ERROR ? 'error' : 'warn'

          request.logger[level]({
            message: boom.message,
            err: boom,
            event: { ...defaultEvent, ...(boom.event ?? {}) }
          })

          return h.continue
        }
      )
    }
  }
}
