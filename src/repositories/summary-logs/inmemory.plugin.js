import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  const factory = createInMemorySummaryLogsRepository()

  return {
    name: 'summaryLogsRepository',
    register: (server) => {
      const repository = factory(server.logger)
      registerDependency(server, 'summaryLogsRepository', () => repository)
    }
  }
}
