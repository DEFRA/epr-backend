import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

export function createInMemoryStreamRepositoryPlugin() {
  return {
    name: 'streamRepository',
    register: (server) => {
      const streamRepository = createInMemoryStreamRepository()()
      registerRepository(server, 'streamRepository', () => streamRepository)
    }
  }
}
