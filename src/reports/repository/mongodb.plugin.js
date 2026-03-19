import { createReportsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoReportsRepositoryPlugin = {
  name: 'reportsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createReportsRepository(server.db)
    const repository = factory()

    registerRepository(server, 'reportsRepository', () => repository)
  }
}
