import { portAdapter } from '#plugins/port-adapter.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

/**
 * @param {Organisation[]} [initialOrganisations]
 */
export function createInMemoryOrganisationReadRepositoryPlugin(
  initialOrganisations
) {
  const createRepository =
    createInMemoryOrganisationReadRepository(initialOrganisations)

  return portAdapter({
    provides: 'organisationReadRepository',
    needs: [],
    build: () => createRepository
  })
}
