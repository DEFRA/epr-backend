import { createWasteRecordsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoWasteRecordsRepositoryPlugin = {
  name: 'wasteRecordsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createWasteRecordsRepository(server.db)
    const repository = factory()

    registerRepository(server, 'wasteRecordsRepository', () => repository)
  }
}
