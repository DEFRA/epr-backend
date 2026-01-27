import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} WasteBalancesDependencies
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} [organisationsRepository]
 */

/**
 * Creates an in-memory waste balances repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * @param {Object[]} [initialWasteBalances] - Initial waste balances data
 * @param {WasteBalancesDependencies} [dependencies] - Dependencies
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/waste-balances/port.js').WasteBalancesRepository }}
 */
export function createInMemoryWasteBalancesRepositoryPlugin(
  initialWasteBalances,
  dependencies
) {
  const factory = createInMemoryWasteBalancesRepository(
    initialWasteBalances,
    dependencies
  )
  const repository = factory()

  const plugin = {
    name: 'wasteBalancesRepository',
    register: (server) => {
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }

  return { plugin, repository }
}
