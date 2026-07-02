import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

// Per-request instantiation for update conflict logging.
/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  const factory = createInMemorySummaryLogsRepository()

  return {
    name: 'summaryLogsRepository',
    register: (server) => {
      registerDependency(server, 'summaryLogsRepository', (request) =>
        factory(request.logger)
      )
    }
  }
}
