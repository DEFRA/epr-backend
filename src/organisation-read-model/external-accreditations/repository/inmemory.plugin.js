import { portAdapter } from '#plugins/port-adapter.js'
import { createInMemoryExternalAccreditationsRepository } from './inmemory.js'

/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */

/**
 * @param {ExternalAccreditation[]} [held] - where the repository holds what it
 *   stores, so a test can read it
 */
export function createInMemoryExternalAccreditationsRepositoryPlugin(held) {
  const createRepository = createInMemoryExternalAccreditationsRepository(held)

  return portAdapter({
    provides: 'externalAccreditationsRepository',
    needs: [],
    build: () => createRepository
  })
}
