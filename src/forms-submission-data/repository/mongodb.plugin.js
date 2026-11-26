import { createFormSubmissionsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @import { ServerApp } from '#common/hapi-types.js' */

export const mongoFormSubmissionsRepositoryPlugin = {
  name: 'formSubmissionsRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  register: async (server) => {
    const { organisationAdministrationRepository } = /** @type {ServerApp} */ (
      server.app
    )
    const factory = await createFormSubmissionsRepository(
      server.db,
      server.logger,
      organisationAdministrationRepository
    )
    const repository = factory()

    registerDependency(server, 'formSubmissionsRepository', () => repository)
  }
}
