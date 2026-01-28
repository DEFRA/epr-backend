import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @typedef {Object} WasteBalancesDependencies
 * @property {import('#repositories/organisations/port.js').OrganisationsRepository} [organisationsRepository]
 */

/**
 * @param {Object[]} [initialWasteBalances]
 * @param {WasteBalancesDependencies} [dependencies]
 * @returns {import('@hapi/hapi').Plugin<void>}
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

  return {
    name: 'wasteBalancesRepository',
    register: (server) => {
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }
}
