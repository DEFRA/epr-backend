import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
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
      TEST_ORGANISATION_NUMBERS
    )

    registerDependency(server, 'packagingRecyclingNotesRepository', (request) =>
      createRepository(request.logger)
    )
  }
}
