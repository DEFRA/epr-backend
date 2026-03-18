import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { createPrnVisibilityFilter } from '#packaging-recycling-notes/application/prn-visibility-filter.js'
import { registerRepository } from '#plugins/register-repository.js'
import { createPackagingRecyclingNotesRepository } from './mongodb.js'

export const packagingRecyclingNotesRepositoryPlugin = {
  name: 'packagingRecyclingNotesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    /** @type {{db?: import('mongodb').Db}} */ options = {}
  ) => {
    const db = options?.db ?? server.db

    const { excludeOrganisationIds } = await createPrnVisibilityFilter(db, {
      testOrganisationIds: TEST_ORGANISATION_IDS
    })

    const createRepository = await createPackagingRecyclingNotesRepository(
      db,
      excludeOrganisationIds
    )

    registerRepository(
      server,
      'packagingRecyclingNotesRepository',
      createRepository
    )
  }
}
