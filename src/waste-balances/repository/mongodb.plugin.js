import { createWasteBalancesRepository } from './repository.js'
import { createMongoStreamRepository } from './stream-mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const streamFactory = await createMongoStreamRepository(server.db)
    const streamRepository = streamFactory()

    const factory = createWasteBalancesRepository({
      streamRepository
    })
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
    registerRepository(server, 'streamRepository', () => streamRepository)
  }
}
