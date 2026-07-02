import { createInMemoryRowStateRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

export function createInMemoryWasteRecordStatesRepositoryPlugin() {
  const repository = createInMemoryRowStateRepository()()

  return {
    name: 'wasteRecordStatesRepository',
    register: (server) => {
      registerDependency(
        server,
        'wasteRecordStatesRepository',
        () => repository
      )
    }
  }
}
