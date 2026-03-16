import { registerRepository } from '#plugins/register-repository.js'
import { createOverseasSitesRepository } from './mongodb.js'

export const overseasSitesRepositoryPlugin = {
  name: 'overseasSitesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],
  /** @param {{db?: import('mongodb').Db}} [options] */
  register: async (server, options) => {
    const db = options?.db ?? server.db

    const createRepository = await createOverseasSitesRepository(db)

    registerRepository(server, 'overseasSitesRepository', createRepository)
  }
}
