import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'

/**
 * @typedef {Object} InMemoryOrganisationsRepositoryPluginOptions
 * @property {Object[]} [initialOrganisations] - Initial organisations data
 */

/**
 * In-memory organisations repository adapter plugin for testing.
 * Registers the organisations repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const inMemoryOrganisationsRepositoryPlugin = {
  name: 'organisationsRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryOrganisationsRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    const factory = createInMemoryOrganisationsRepository(
      options.initialOrganisations
    )
    const repository = factory()

    server.ext('onRequest', (request, h) => {
      Object.defineProperty(request, 'organisationsRepository', {
        get() {
          return repository
        },
        enumerable: true,
        configurable: true
      })
      return h.continue
    })
  }
}
