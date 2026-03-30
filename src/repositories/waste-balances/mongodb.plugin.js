import { createWasteBalancesRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoWasteBalancesRepositoryPlugin = {
  name: 'wasteBalancesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createWasteBalancesRepository(server.db)
    const repository = factory()

    registerRepository(server, 'wasteBalancesRepository', () => repository)
  }
}
