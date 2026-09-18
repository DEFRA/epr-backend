import { registerDependency } from '#plugins/register-dependency.js'
import { createMarketInsightsExportsRepository } from './mongodb.js'

export const marketInsightsExportsRepositoryPlugin = {
  name: 'marketInsightsExportsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],
  register: async (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    /** @type {{db?: import('mongodb').Db}} */ options = {}
  ) => {
    const db = options?.db ?? server.db

    const createRepository = await createMarketInsightsExportsRepository(db)

    registerDependency(
      server,
      'marketInsightsExportsRepository',
      createRepository
    )
  }
}
