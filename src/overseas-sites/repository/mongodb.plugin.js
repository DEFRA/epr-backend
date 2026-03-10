import { registerRepository } from '#plugins/register-repository.js'
import { createOverseasSitesRepository } from './mongodb.js'

/**
 * Plugin to register the overseas sites MongoDB repository
 * @type {import('@hapi/hapi').Plugin<{db: import('mongodb').Db}>}
 */
export const overseasSitesRepositoryPlugin = {
  name: 'overseasSitesRepository',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    options
  ) => {
    const db = options?.db ?? server.db

    const createRepository = await createOverseasSitesRepository(db)

    registerRepository(server, 'overseasSitesRepository', createRepository)
  }
}
