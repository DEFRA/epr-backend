import { registerRepository } from '#plugins/register-repository.js'
import { createOverseasSitesRepository } from './mongodb.js'

export const overseasSitesRepositoryPlugin = {
  name: 'overseasSitesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    /** @type {{db?: import('mongodb').Db}} */ options = {}
  ) => {
    const db = options?.db ?? server.db

    const createRepository = await createOverseasSitesRepository(db)

    registerRepository(server, 'overseasSitesRepository', createRepository)
  }
}
