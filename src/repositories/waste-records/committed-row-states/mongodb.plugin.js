import { createMongoRowStateRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoCommittedRowStatesRepositoryPlugin = {
  name: 'committedRowStatesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createMongoRowStateRepository(server.db)
    const repository = factory()

    registerRepository(server, 'committedRowStatesRepository', () => repository)
  }
}
