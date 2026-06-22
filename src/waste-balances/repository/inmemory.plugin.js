import { createWasteBalancesRepository } from './repository.js'
import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

export function createInMemoryWasteBalancesRepositoryPlugin() {
  return {
    name: 'wasteBalancesRepository',
    register: (server) => {
      const streamRepository = createInMemoryStreamRepository()()
      const factory = createWasteBalancesRepository({
        streamRepository,
        rowStateRepository: server.app.wasteRecordStatesRepository,
        featureFlags: server.featureFlags
      })
      const repository = factory()
      registerRepository(server, 'wasteBalancesRepository', () => repository)
      registerRepository(server, 'streamRepository', () => streamRepository)
    }
  }
}
