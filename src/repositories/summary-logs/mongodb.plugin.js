import { createSummaryLogsRepository } from './mongodb.js'
import { registerRepository } from '#plugins/register-repository.js'

export const mongoSummaryLogsRepositoryPlugin = {
  name: 'summaryLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  register: async (server) => {
    const repository = await createSummaryLogsRepository(
      server.db,
      server.logger
    )

    registerRepository(server, 'summaryLogsRepository', () => repository)
  }
}
