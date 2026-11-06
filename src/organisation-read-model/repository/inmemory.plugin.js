import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'

/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */
/** @import { HapiServer } from '#common/hapi-types.js' */

/**
 * Reads exporters' sites through `server.app.overseasSitesRepository` and
 * future accreditations through `server.app.futureAccreditationsRepository`,
 * so both must register before this plugin.
 *
 * @param {StoredOrganisation[]} [initialOrganisations]
 */
export function createInMemoryOrganisationReadRepositoryPlugin(
  initialOrganisations
) {
  const createRepository =
    createInMemoryOrganisationReadRepository(initialOrganisations)

  return {
    name: 'organisationReadRepository',
    dependencies: ['overseasSitesRepository', 'futureAccreditationsRepository'],
    /** @param {import('@hapi/hapi').Server & HapiServer} server */
    register: (server) => {
      const overseasSitesRepository = server.app.overseasSitesRepository
      const futureAccreditationsRepository =
        server.app.futureAccreditationsRepository
      registerDependency(server, 'organisationReadRepository', ({ logger }) =>
        createRepository({
          futureAccreditationsRepository,
          overseasSitesRepository,
          logger
        })
      )
    }
  }
}
