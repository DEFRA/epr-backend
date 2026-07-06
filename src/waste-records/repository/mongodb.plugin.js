import { createMongoSummaryLogRowStateRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoSummaryLogRowStatesRepositoryPlugin = {
  name: 'summaryLogRowStatesRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createMongoSummaryLogRowStateRepository(server.db)
    const repository = factory()

    registerDependency(
      server,
      'summaryLogRowStatesRepository',
      () => repository
    )
  }
}
