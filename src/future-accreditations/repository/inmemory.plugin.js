import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryFutureAccreditationsRepository } from './inmemory.js'

export const createInMemoryFutureAccreditationsRepositoryPlugin = () => {
  const repository = createInMemoryFutureAccreditationsRepository()()

  return {
    name: 'futureAccreditationsRepository',
    register: (server) => {
      registerDependency(
        server,
        'futureAccreditationsRepository',
        () => repository
      )
    }
  }
}
