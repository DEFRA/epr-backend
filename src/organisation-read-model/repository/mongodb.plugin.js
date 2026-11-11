import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */

/**
 * Reads exporters' sites through `server.app.overseasSitesRepository`, so it
 * must register before this plugin.
 */
export const organisationReadRepositoryPlugin = {
  name: 'organisationReadRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'overseasSitesRepository'],

  /**
   * @param {import('@hapi/hapi').Server & { db: Db }} server
   */
  register: (server) => {
    const overseasSitesRepository = /** @type {OverseasSitesRepository} */ (
      server.app.overseasSitesRepository
    )
    const createRepository = createOrganisationReadRepository(server.db)
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createRepository({ overseasSitesRepository, logger })
    )
  }
}
