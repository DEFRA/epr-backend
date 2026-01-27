import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} MongoOrganisationsRepositoryPluginOptions
 * @property {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

export const mongoOrganisationsRepositoryPlugin = {
  name: 'organisationsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /** @param {MongoOrganisationsRepositoryPluginOptions} [options] */
  register: async (server, options = {}) => {
    const factory = await createOrganisationsRepository(
      server.db,
      options.eventualConsistency
    )
    const repository = factory()

    registerRepository(server, 'organisationsRepository', () => repository)
  }
}
