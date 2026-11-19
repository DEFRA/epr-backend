import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { HapiServer } from '#common/hapi-types.js' */

/**
 * @param {Organisation[]} [initialOrganisations]
 */
export function createInMemoryOrganisationReadRepositoryPlugin(
  initialOrganisations
) {
  const createRepository =
    createInMemoryOrganisationReadRepository(initialOrganisations)

  return {
    name: 'organisationReadRepository',
    /** @param {import('@hapi/hapi').Server & HapiServer} server */
    register: (server) => {
      registerDependency(server, 'organisationReadRepository', () =>
        createRepository()
      )
    }
  }
}
