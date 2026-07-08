import { createMongoSummaryLogRowStatesBackfillWatermarkRepository } from './mongodb.js'
import { registerDependency } from '#plugins/register-dependency.js'

export const mongoSummaryLogRowStatesBackfillWatermarkRepositoryPlugin = {
  name: 'summaryLogRowStatesBackfillWatermarkRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory =
      await createMongoSummaryLogRowStatesBackfillWatermarkRepository(server.db)
    const repository = factory()

    registerDependency(
      server,
      'summaryLogRowStatesBackfillWatermarkRepository',
      () => repository
    )
  }
}
