import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { StatusCodes } from 'http-status-codes'

export const authFailureLogger = {
  plugin: {
    name: 'auth-failure-logger',
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

          if ('isBoom' in response && response.isBoom) {
            const boom = /** @type {import('@hapi/boom').Boom} */ (response)

            if (boom.output.statusCode === StatusCodes.UNAUTHORIZED) {
              request.logger.warn({
                message: `${boom.message} (path: ${request.path}, method: ${request.method})`,
                err: boom,
                event: {
                  category: LOGGING_EVENT_CATEGORIES.AUTH,
                  action: LOGGING_EVENT_ACTIONS.AUTH_FAILED
                }
              })
            }
          }

          return h.continue
        }
      )
    }
  }
}
