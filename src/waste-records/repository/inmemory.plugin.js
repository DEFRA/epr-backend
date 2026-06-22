import { createInMemoryRowStateRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

export function createInMemoryWasteRecordStatesRepositoryPlugin() {
  const repository = createInMemoryRowStateRepository()()

  return {
    name: 'wasteRecordStatesRepository',
    register: (server) => {
      registerRepository(
        server,
        'wasteRecordStatesRepository',
        () => repository
      )
    }
  }
}
