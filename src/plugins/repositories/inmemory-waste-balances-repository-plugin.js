import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} InMemoryWasteBalancesRepositoryPluginOptions
 * @property {Object[]} [initialWasteBalances] - Initial waste balances data
 * @property {Object} [dependencies] - Dependencies (e.g. organisationsRepository)
 */

/**
 * In-memory waste balances repository adapter plugin for testing.
 * Registers the waste balances repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const inMemoryWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryWasteBalancesRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    const factory = createInMemoryWasteBalancesRepository(
      options.initialWasteBalances,
      options.dependencies
    )
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
  }
}
