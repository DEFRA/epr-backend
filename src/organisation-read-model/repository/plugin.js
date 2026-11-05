import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './adapter.js'

/** @import { FutureAccreditationsRepository } from '#future-accreditations/repository/port.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * Reads through `server.app.organisationsRepository`,
 * `server.app.overseasSitesRepository` and
 * `server.app.futureAccreditationsRepository`, so all three must register
 * before this plugin.
 */
export const organisationReadRepositoryPlugin = {
  name: 'organisationReadRepository',
  version: '1.0.0',
  dependencies: [
    'organisationsRepository',
    'overseasSitesRepository',
    'futureAccreditationsRepository'
  ],

  register: (server) => {
    const organisationsRepository = /** @type {OrganisationsRepository} */ (
      server.app.organisationsRepository
    )
    const overseasSitesRepository = /** @type {OverseasSitesRepository} */ (
      server.app.overseasSitesRepository
    )
    const futureAccreditationsRepository =
      /** @type {FutureAccreditationsRepository} */ (
        server.app.futureAccreditationsRepository
      )
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createOrganisationReadRepository({
        futureAccreditationsRepository,
        organisationsRepository,
        overseasSitesRepository,
        logger
      })
    )
  }
}
