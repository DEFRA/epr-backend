import { createFormSubmissionsRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @import { Server } from '@hapi/hapi' */
/** @import { Db } from 'mongodb' */
/** @import { ServerApp } from '#common/hapi-types.js' */

/**
 * The MongoDB adapter for the form submissions port. It is not made with
 * `portAdapter`, because the organisations repository's plugin is not named
 * after the port this adapter needs.
 */
export const formSubmissionsRepositoryPlugin = {
  name: 'formSubmissionsRepository',
  version: '1.0.0',

  /** @param {Server} server */
  register: (server) => {
    server.dependency(
      ['mongodb', 'organisationsRepository'],
      async (started) => {
        const app = /** @type {ServerApp} */ (started.app)
        const factory = await createFormSubmissionsRepository(
          /** @type {Server & { db: Db }} */ (started).db,
          started.logger,
          app.organisationAdministrationRepository
        )
        const repository = factory()

        registerDependency(
          started,
          'formSubmissionsRepository',
          () => repository
        )
      }
    )
  }
}
