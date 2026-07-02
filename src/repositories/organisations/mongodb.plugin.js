import { createOrganisationsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

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

    registerDependency(server, 'organisationsRepository', () => repository)
  }
}
