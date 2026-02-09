/**
 * Registers a repository on both server.app and request objects.
 *
 * - server.app[name]: Created once at startup using server.logger.
 *   Use this for background jobs (queue consumers, workers) that run outside
 *   HTTP request context.
 *
 * - request[name]: Created lazily per-request using request.logger.
 *   Use this in HTTP route handlers to get correlation IDs in logs.
 *
 * @param {import('@hapi/hapi').Server} server - Hapi server instance
 * @param {string} name - Property name to register (e.g. 'organisationsRepository')
 * @param {(request: {logger: unknown}) => unknown} getInstance - Factory function that returns the repository instance
 */
export const registerRepository = (server, name, getInstance) => {
  // Register on server.app for background jobs (using server.logger)
  server.app[name] = getInstance({ logger: server.logger })

  // Register on request for HTTP routes (using request.logger for correlation IDs)
  server.ext('onRequest', (request, h) => {
    let cached

    Object.defineProperty(request, name, {
      get() {
        if (!cached) {
          cached = getInstance(request)
        }
        return cached
      },
      enumerable: true,
      configurable: true
    })

    return h.continue
  })
}
