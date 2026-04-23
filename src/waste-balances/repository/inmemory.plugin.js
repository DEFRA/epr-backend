import { createInMemoryWasteBalancesRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * @param {Object[]} [initialWasteBalances]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryWasteBalancesRepositoryPlugin(
  initialWasteBalances
) {
  const factory = createInMemoryWasteBalancesRepository(initialWasteBalances)
  const repository = factory()

  return {
    name: 'wasteBalancesRepository',
    register: (server) => {
      registerRepository(server, 'wasteBalancesRepository', () => repository)
    }
  }
}
