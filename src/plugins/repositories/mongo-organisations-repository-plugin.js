import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} MongoOrganisationsRepositoryPluginOptions
 * @property {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

/**
 * MongoDB organisations repository adapter plugin.
 * Registers the organisations repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const mongoOrganisationsRepositoryPlugin = {
  name: 'organisationsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {MongoOrganisationsRepositoryPluginOptions} [options]
   */
  register: async (server, options = {}) => {
    const factory = await createOrganisationsRepository(
      server.db,
      options.eventualConsistency
    )
    const repository = factory()

    registerRepository(server, 'organisationsRepository', () => repository)
  }
}
