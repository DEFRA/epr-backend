import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} MongoWasteBalancesRepositoryPluginOptions
 * @property {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

// Creates its own internal organisationsRepository for internal operations,
// separate from the organisationsRepository registered for route handlers.
export const mongoWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /** @param {MongoWasteBalancesRepositoryPluginOptions} [options] */
  register: async (server, options = {}) => {
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
