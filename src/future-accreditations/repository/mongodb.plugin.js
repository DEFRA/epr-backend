import { registerDependency } from '#plugins/register-dependency.js'
import { createMongoFutureAccreditationsRepository } from './mongodb.js'

export const mongoFutureAccreditationsRepositoryPlugin = {
  name: 'futureAccreditationsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createMongoFutureAccreditationsRepository(server.db)
    const repository = factory()

    registerDependency(
      server,
      'futureAccreditationsRepository',
      () => repository
    )
  }
}
