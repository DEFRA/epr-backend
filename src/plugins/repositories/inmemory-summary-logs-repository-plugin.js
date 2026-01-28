import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { registerRepository } from './register-repository.js'

// Per-request instantiation for update conflict logging.
/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  const factory = createInMemorySummaryLogsRepository()

  return {
    name: 'summaryLogsRepository',
    register: (server) => {
      registerRepository(server, 'summaryLogsRepository', (request) =>
        factory(request.logger)
      )
    }
  }
}
