import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { createPrnVisibilityFilter } from '#packaging-recycling-notes/application/prn-visibility-filter.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { createPackagingRecyclingNotesRepository } from './mongodb.js'

export const packagingRecyclingNotesRepositoryPlugin = {
  name: 'packagingRecyclingNotesRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    /** @type {{db?: import('mongodb').Db}} */ options = {}
  ) => {
    const db = options?.db ?? server.db
    const { organisationsRepository } =
      /** @type {import('#common/hapi-types.js').ServerApp} */ (server.app)

    const { excludeOrganisationIds } = await createPrnVisibilityFilter(
      organisationsRepository,
      { testOrganisationIds: [...TEST_ORGANISATION_IDS] }
    )

    const createRepository = await createPackagingRecyclingNotesRepository(
      db,
      excludeOrganisationIds
    )

    registerDependency(server, 'packagingRecyclingNotesRepository', (request) =>
      createRepository(request.logger)
    )
  }
}
