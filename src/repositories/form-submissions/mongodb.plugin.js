import { createFormSubmissionsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoFormSubmissionsRepositoryPlugin = {
  name: 'formSubmissionsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createFormSubmissionsRepository(server.db)
    const repository = factory()

    registerRepository(server, 'formSubmissionsRepository', () => repository)
  }
}
