import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { registerDependency } from '#plugins/register-dependency.js'
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

    const createRepository = await createPackagingRecyclingNotesRepository(
      db,
      [...TEST_ORGANISATION_IDS].map((orgId) =>
        toOrganisationNumber(String(orgId))
      )
    )

    registerDependency(server, 'packagingRecyclingNotesRepository', (request) =>
      createRepository(request.logger)
    )
  }
}
