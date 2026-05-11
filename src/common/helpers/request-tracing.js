import { randomUUID } from 'node:crypto'

import { tracing } from '@defra/hapi-tracing'

import { config, isLocalEnvironment } from '#root/config.js'

/**
 * @import { Server } from '@hapi/hapi'
 */

/**
 * @typedef {{ tracingHeader: string }} TracingOptions
 */

export const getTracingHeaderName = () => config.get('tracing.header')

const localTraceIdFallback = {
  name: 'local-trace-id-fallback',
  /**
   * @param {Server} server
   * @param {TracingOptions} options
   */
  register: (server, { tracingHeader }) => {
    server.ext(
      'onRequest',
      (request, h) => {
        if (!request.headers[tracingHeader]) {
          request.headers[tracingHeader] = randomUUID()
        }
        return h.continue
      },
      { before: 'hapi-pino' }
    )
  }
}

export const requestTracing = {
  plugin: {
    name: 'request-tracing',
    /**
     * @param {Server} server
     * @param {TracingOptions} options
     */
    register: async (server, options) => {
      if (isLocalEnvironment()) {
        await server.register({ plugin: localTraceIdFallback, options })
      }
      await server.register({ plugin: tracing.plugin, options })
    }
  },
  options: {
    tracingHeader: getTracingHeaderName()
  }
}
