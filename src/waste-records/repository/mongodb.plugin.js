import { createMongoRowStateRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoWasteRecordStatesRepositoryPlugin = {
  name: 'wasteRecordStatesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createMongoRowStateRepository(server.db)
    const repository = factory()

    registerDependency(server, 'wasteRecordStatesRepository', () => repository)
  }
}
