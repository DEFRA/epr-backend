import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { createInMemoryLedgerRepository } from './ledger-inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Object[]} [initialWasteBalances]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryWasteBalancesRepositoryPlugin(
  initialWasteBalances
) {
  return {
    name: 'wasteBalancesRepository',
    register: (server) => {
      const ledgerRepository = createInMemoryLedgerRepository()()
      const factory = createInMemoryWasteBalancesRepository(
        initialWasteBalances,
        {
          ledgerRepository,
          featureFlags:
            /** @type {import('#common/hapi-types.js').HapiServer} */ (
              /** @type {*} */ (server)
            ).featureFlags
        }
      )
      const repository = factory()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }
}
