import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} MongoWasteBalancesRepositoryPluginOptions
 * @property {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

/**
 * MongoDB waste balances repository adapter plugin.
 * Registers the waste balances repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 *
 * Creates its own internal organisationsRepository for internal operations.
 * This is separate from the organisationsRepository registered for route handlers.
 */
export const mongoWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {MongoWasteBalancesRepositoryPluginOptions} [options]
   */
  register: async (server, options = {}) => {
    // Create internal organisationsRepository for wasteBalances' internal operations
    const organisationsFactory = await createOrganisationsRepository(
      server.db,
      options.eventualConsistency
    )
    const organisationsRepository = organisationsFactory()

    const factory = await createWasteBalancesRepository(server.db, {
      organisationsRepository
    })
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
  }
}
