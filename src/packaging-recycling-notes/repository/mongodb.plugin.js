import { createPackagingRecyclingNotesRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { createPrnVisibilityFilter } from '#packaging-recycling-notes/application/prn-visibility-filter.js'

/**
 * Plugin to register the packaging recycling notes MongoDB repository
 * @type {import('@hapi/hapi').Plugin<{db: import('mongodb').Db}>}
 */
export const packagingRecyclingNotesRepositoryPlugin = {
  name: 'packagingRecyclingNotesRepository',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    options
  ) => {
    const db = options?.db ?? server.db
    const { excludeOrganisationIds } = await createPrnVisibilityFilter(db, {
      testOrganisationIds: TEST_ORGANISATION_IDS
    })
    const createRepository = await createPackagingRecyclingNotesRepository(db, {
      excludeOrganisationIds
    })

    registerRepository(
      server,
      'packagingRecyclingNotesRepository',
      createRepository
    )
  }
}
