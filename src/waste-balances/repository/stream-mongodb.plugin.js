import { createMongoStreamRepository } from './stream-mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoStreamRepositoryPlugin = {
  name: 'streamRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const streamFactory = await createMongoStreamRepository(server.db)
    const streamRepository = streamFactory()

    registerDependency(server, 'streamRepository', () => streamRepository)
  }
}
