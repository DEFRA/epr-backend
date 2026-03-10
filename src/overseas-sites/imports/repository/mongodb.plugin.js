import { registerRepository } from '#plugins/register-repository.js'
import { createOrsImportsRepository } from './mongodb.js'

/**
 * Plugin to register the ORS imports MongoDB repository
 * @type {import('@hapi/hapi').Plugin<{db: import('mongodb').Db}>}
 */
export const orsImportsRepositoryPlugin = {
  name: 'orsImportsRepository',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    options
  ) => {
    const db = options?.db ?? server.db

    const createRepository = await createOrsImportsRepository(db)

    registerRepository(server, 'orsImportsRepository', createRepository)
  }
}
