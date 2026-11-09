import { createFormSubmissionsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoFormSubmissionsRepositoryPlugin = {
  name: 'formSubmissionsRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  register: async (server) => {
    const factory = await createFormSubmissionsRepository(
      server.db,
      server.logger,
      server.app.organisationsRepository
    )
    const repository = factory()

    registerDependency(server, 'formSubmissionsRepository', () => repository)
  }
}
