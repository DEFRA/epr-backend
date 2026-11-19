import { registerDependency } from '#plugins/register-dependency.js'
import { createRegistrationAccreditationAdminRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */

/**
 * Registers after the organisations repository, which creates the indexes on
 * the collection this repository reads.
 */
export const registrationAccreditationAdminRepositoryPlugin = {
  name: 'registrationAccreditationAdminRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  /** @param {import('@hapi/hapi').Server & { db: Db }} server */
  register: (server) => {
    const createRepository = createRegistrationAccreditationAdminRepository(
      server.db
    )
    registerDependency(server, 'registrationAccreditationAdminRepository', () =>
      createRepository()
    )
  }
}
