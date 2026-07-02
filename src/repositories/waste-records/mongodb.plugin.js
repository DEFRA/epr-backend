import { createWasteRecordsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoWasteRecordsRepositoryPlugin = {
  name: 'wasteRecordsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createWasteRecordsRepository(server.db)
    const repository = factory()

    registerDependency(server, 'wasteRecordsRepository', () => repository)
  }
}
