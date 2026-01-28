import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { registerRepository } from '#plugins/register-repository.js'

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
