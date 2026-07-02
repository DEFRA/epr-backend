import { createInMemoryStreamRepository } from './stream-inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

export function createInMemoryStreamRepositoryPlugin() {
  return {
    name: 'streamRepository',
    register: (server) => {
      const streamRepository = createInMemoryStreamRepository()()
      registerDependency(server, 'streamRepository', () => streamRepository)
    }
  }
}
