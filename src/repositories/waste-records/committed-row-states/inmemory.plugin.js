import { createInMemoryRowStateRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

export function createInMemoryCommittedRowStatesRepositoryPlugin() {
  const repository = createInMemoryRowStateRepository()()

  return {
    name: 'committedRowStatesRepository',
    register: (server) => {
      registerRepository(
        server,
        'committedRowStatesRepository',
        () => repository
      )
    }
  }
}
