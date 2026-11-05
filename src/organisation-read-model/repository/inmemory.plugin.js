import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

/**
 * @param {Organisation[]} [initialOrganisations]
 * @returns {import('@hapi/hapi').Plugin<void>}
 */
export function createInMemoryOrganisationReadRepositoryPlugin(
  initialOrganisations
) {
  const repository =
    createInMemoryOrganisationReadRepository(initialOrganisations)()

  return {
    name: 'organisationReadRepository',
    register: (server) => {
      registerDependency(server, 'organisationReadRepository', () => repository)
    }
  }
}
