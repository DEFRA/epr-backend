/**
 * Registers a repository on the request object using lazy initialisation.
 *
 * @param {import('@hapi/hapi').Server} server - Hapi server instance
 * @param {string} name - Property name to register on request (e.g. 'organisationsRepository')
 * @param {(request: import('@hapi/hapi').Request) => unknown} getInstance - Factory function that returns the repository instance
 */
export const registerRepository = (server, name, getInstance) => {
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
