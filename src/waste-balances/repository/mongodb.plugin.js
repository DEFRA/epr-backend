import { createWasteBalancesRepository } from './repository.js'
import { createMongoStreamRepository } from './stream-mongodb.js'
import { createMongoRowStateRepository } from './row-states-mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const streamFactory = await createMongoStreamRepository(server.db)
    const streamRepository = streamFactory()

    const rowStateFactory = await createMongoRowStateRepository(server.db)
    const rowStateRepository = rowStateFactory()

    const factory = createWasteBalancesRepository({
      streamRepository,
      rowStateRepository
    })
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
    registerRepository(server, 'streamRepository', () => streamRepository)
    registerRepository(server, 'rowStateRepository', () => rowStateRepository)
  }
}
