import { randomUUID } from 'node:crypto'

import { tracing } from '@defra/hapi-tracing'

import { config, isLocalEnvironment } from '#root/config.js'

/**
 * @import { HapiServer, HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 */

/**
 * @typedef {{ tracingHeader: string }} TracingOptions
 */

export const getTracingHeaderName = () => config.get('tracing.header')

const localTraceIdFallback = {
  name: 'local-trace-id-fallback',
  /**
   * @param {HapiServer} server
   * @param {TracingOptions} options
   */
  register: (server, { tracingHeader }) => {
    server.ext(
      'onRequest',
      /**
       * @param {HapiRequest} request
       * @param {HapiResponseToolkit} h
       */
      (request, h) => {
        if (!request.headers[tracingHeader]) {
          request.headers[tracingHeader] = randomUUID()
        }
        return h.continue
      }
    )
  }
}

export const requestTracing = {
  plugin: {
    name: 'request-tracing',
    /**
     * @param {HapiServer} server
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
