import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  return {
    name: 'summaryLogsRepository',
    register: (server) => {
      const repository = createInMemorySummaryLogsRepository(server.logger)

      registerRepository(server, 'summaryLogsRepository', () => repository)
    }
  }
}
