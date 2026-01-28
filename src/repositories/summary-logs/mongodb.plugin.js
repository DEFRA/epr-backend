import { createSummaryLogsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

// Per-request instantiation: needs request.logger for update conflict logging.
export const mongoSummaryLogsRepositoryPlugin = {
  name: 'summaryLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const factory = await createSummaryLogsRepository(server.db)

    registerRepository(server, 'summaryLogsRepository', (request) =>
      factory(request.logger)
    )
  }
}
