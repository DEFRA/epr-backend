import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} MongoWasteBalancesRepositoryPluginOptions
 * @property {Object} [dependencies] - Dependencies (e.g. organisationsRepository)
 */

/**
 * MongoDB waste balances repository adapter plugin.
 * Registers the waste balances repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 *
 * Note: This plugin may depend on organisationsRepository being available
 * if certain features require it. Pass dependencies via options if needed.
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
    const factory = await createWasteBalancesRepository(
      server.db,
      options.dependencies
    )
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
  }
}
