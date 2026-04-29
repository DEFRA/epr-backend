import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { createInMemoryLedgerRepository } from './ledger-inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Object[]} [initialWasteBalances]
 */
export function createInMemoryWasteBalancesRepositoryPlugin(
  initialWasteBalances
) {
  return {
    name: 'wasteBalancesRepository',
    dependencies: ['feature-flags'],
    register: (server) => {
      const ledgerRepository = createInMemoryLedgerRepository()()
      const factory = createInMemoryWasteBalancesRepository(
        initialWasteBalances,
        {
          ledgerRepository,
          featureFlags: server.featureFlags
        }
      )
      const repository = factory()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }
}
