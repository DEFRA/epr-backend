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
    register: (server) => {
      const streamRepository = createInMemoryStreamRepository()()
      const factory = createInMemoryWasteBalancesRepository(
        initialWasteBalances ?? [],
        {
          streamRepository
        }
      )
      const repository = factory()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
      registerRepository(server, 'streamRepository', () => streamRepository)
    }
  }
}
