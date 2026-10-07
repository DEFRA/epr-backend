import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './adapter.js'

/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/**
 * Reads through `server.app.organisationsRepository` and
 * `server.app.overseasSitesRepository`, so both must register before this
 * plugin.
 */
export const organisationReadRepositoryPlugin = {
  name: 'organisationReadRepository',
  version: '1.0.0',
  dependencies: ['organisationsRepository', 'overseasSitesRepository'],

  register: (server) => {
    const organisationsRepository = /** @type {OrganisationsRepository} */ (
      server.app.organisationsRepository
    )
    const overseasSitesRepository = /** @type {OverseasSitesRepository} */ (
      server.app.overseasSitesRepository
    )
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createOrganisationReadRepository({
        organisationsRepository,
        overseasSitesRepository,
        logger
      })
    )
  }
}
