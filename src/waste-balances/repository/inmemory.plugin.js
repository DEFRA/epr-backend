import { createWasteBalancesRepository } from './repository.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { createInMemoryRowStateRepository } from './row-states-inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

export function createInMemoryWasteBalancesRepositoryPlugin() {
  return {
    name: 'wasteBalancesRepository',
    register: (server) => {
      const streamRepository = createInMemoryStreamRepository()()
      const rowStateRepository = createInMemoryRowStateRepository()()
      const factory = createWasteBalancesRepository({
        streamRepository,
        rowStateRepository
      })
      const repository = factory()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
      registerRepository(server, 'streamRepository', () => streamRepository)
      registerRepository(server, 'rowStateRepository', () => rowStateRepository)
    }
  }
}
