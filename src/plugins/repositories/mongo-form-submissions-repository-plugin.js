import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { registerRepository } from './register-repository.js'

/**
 * MongoDB form submissions repository adapter plugin.
 * Registers the form submissions repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This is a stateless repository - the same instance is used for all requests.
 */
export const mongoFormSubmissionsRepositoryPlugin = {
  name: 'formSubmissionsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: async (server) => {
    const factory = await createFormSubmissionsRepository(server.db)
    const repository = factory()

    registerRepository(server, 'formSubmissionsRepository', () => repository)
  }
}
