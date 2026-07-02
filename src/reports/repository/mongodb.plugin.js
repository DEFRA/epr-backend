import { createReportsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoReportsRepositoryPlugin = {
  name: 'reportsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createReportsRepository(server.db)
    const repository = factory()

    registerDependency(server, 'reportsRepository', () => repository)
  }
}
