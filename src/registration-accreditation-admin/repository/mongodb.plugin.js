import { registerDependency } from '#plugins/register-dependency.js'
import { createRegistrationAccreditationAdminRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */

/**
 * Registers after the organisations repository, which creates the indexes on
 * the collection both repositories read and write.
 */
export const registrationAccreditationAdminRepositoryPlugin = {
  name: 'registrationAccreditationAdminRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  /**
   * @param {import('@hapi/hapi').Server & { db: Db }} server
   * @param {{ eventualConsistency?: { maxRetries?: number, retryDelayMs?: number } }} [options]
   */
  register: (server, options = {}) => {
    const createRepository = createRegistrationAccreditationAdminRepository(
      server.db,
      options.eventualConsistency
    )
    registerDependency(server, 'registrationAccreditationAdminRepository', () =>
      createRepository()
    )
  }
}
