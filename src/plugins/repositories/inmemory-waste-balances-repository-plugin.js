import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { registerRepository } from './register-repository.js'

/**
 * @typedef {Object} WasteBalancesDependencies
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} [organisationsRepository]
 */

/**
 * @param {Object[]} [initialWasteBalances]
 * @param {WasteBalancesDependencies} [dependencies]
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
