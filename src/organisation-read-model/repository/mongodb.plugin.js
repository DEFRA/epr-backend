import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { FutureAccreditationsRepository } from '#future-accreditations/repository/port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

/**
 * @typedef {Object} OrganisationReadRepositoryPluginOptions
 * @property {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

/**
 * Reads exporters' sites through `server.app.overseasSitesRepository` and
 * future accreditations through `server.app.futureAccreditationsRepository`,
 * so both must register before this plugin.
 */
export const organisationReadRepositoryPlugin = {
  name: 'organisationReadRepository',
  version: '1.0.0',
  dependencies: [
    'mongodb',
    'overseasSitesRepository',
    'futureAccreditationsRepository'
  ],

  /**
   * @param {import('@hapi/hapi').Server & { db: Db }} server
   * @param {OrganisationReadRepositoryPluginOptions} [options]
   */
  register: (server, options = {}) => {
    const overseasSitesRepository = /** @type {OverseasSitesRepository} */ (
      server.app.overseasSitesRepository
    )
    const futureAccreditationsRepository =
      /** @type {FutureAccreditationsRepository} */ (
        server.app.futureAccreditationsRepository
      )
    const createRepository = createOrganisationReadRepository(
      server.db,
      options.eventualConsistency
    )
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createRepository({
        futureAccreditationsRepository,
        overseasSitesRepository,
        logger
      })
    )
  }
}
