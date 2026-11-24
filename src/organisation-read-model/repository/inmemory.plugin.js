import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'

/** @import { Server } from '@hapi/hapi' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

/**
 * The in-memory adapter for the organisation read repository.
 *
 * @param {Organisation[]} [initialOrganisations]
 */
export function createInMemoryOrganisationReadRepositoryPlugin(
  initialOrganisations
) {
  const createRepository =
    createInMemoryOrganisationReadRepository(initialOrganisations)

  return {
    name: /** @type {const} */ ('organisationReadRepository'),

    /**
     * @param {Server} server
     * @returns {void}
     */
    register: (server) => {
      registerDependency(server, 'organisationReadRepository', () =>
        createRepository()
      )
    }
  }
}
