import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
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
      const streamRepository = createInMemoryStreamRepository()()
      const factory = createInMemoryWasteBalancesRepository(
        initialWasteBalances ?? [],
        {
          streamRepository,
          featureFlags: server.featureFlags
        }
      )
      const repository = factory()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }
}
