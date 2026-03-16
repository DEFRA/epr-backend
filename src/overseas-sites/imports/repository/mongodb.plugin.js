import { registerRepository } from '#plugins/register-repository.js'
import { createOrsImportsRepository } from './mongodb.js'

export const orsImportsRepositoryPlugin = {
  name: 'orsImportsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],
  /** @param {{db?: import('mongodb').Db}} [options] */
  register: async (server, options) => {
    const db = options?.db ?? server.db

    const createRepository = await createOrsImportsRepository(db)

    registerRepository(server, 'orsImportsRepository', createRepository)
  }
}
