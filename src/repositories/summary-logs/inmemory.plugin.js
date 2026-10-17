import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { registerDependency } from '#plugins/register-dependency.js'

/** @import { ServerApp } from '#common/hapi-types.js' */

// Per-request instantiation for update conflict logging.
/** @returns {import('@hapi/hapi').Plugin<void>} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  return {
    name: 'summaryLogsRepository',
    dependencies: ['organisationsRepository'],
    register: (server) => {
      const { organisationsRepository } = /** @type {ServerApp} */ (server.app)
      const factory = createInMemorySummaryLogsRepository(
        organisationsRepository
      )
      registerDependency(server, 'summaryLogsRepository', (request) =>
        factory(request.logger)
      )
    }
  }
}
