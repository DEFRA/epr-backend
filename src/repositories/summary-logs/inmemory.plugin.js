import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

// Per-request instantiation for update conflict logging.
/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  return {
    name: 'summaryLogsRepository',
    register: (server) => {
      const factory = createInMemorySummaryLogsRepository()
      registerDependency(server, 'summaryLogsRepository', (request) =>
        factory(request.logger)
      )
    }
  }
}
