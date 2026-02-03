import { createPackagingRecyclingNotesRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

/**
 * Plugin to register the lumpy packaging recycling notes MongoDB repository
 * @type {import('@hapi/hapi').Plugin<{db: import('mongodb').Db}>}
 */
export const lumpyPackagingRecyclingNotesRepositoryPlugin = {
  name: 'lumpyPackagingRecyclingNotesRepository',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    options
  ) => {
    const db = options?.db ?? server.db
    const createRepository = await createPackagingRecyclingNotesRepository(db)

    registerRepository(
      server,
      'lumpyPackagingRecyclingNotesRepository',
      createRepository
    )
  }
}
