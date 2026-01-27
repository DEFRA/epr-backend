import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { registerRepository } from './register-repository.js'

/* c8 ignore start - intentionally empty functions */
const noopLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {}
}
/* c8 ignore stop */

// Per-request instantiation for update conflict logging.
// Storage shared between test instance (noop logger) and per-request instances.
/** @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/summary-logs/port.js').SummaryLogsRepository }} */
export function createInMemorySummaryLogsRepositoryPlugin() {
  const factory = createInMemorySummaryLogsRepository()
  const repository = factory(noopLogger)

  const plugin = {
    name: 'summaryLogsRepository',
    register: (server) => {
      registerRepository(server, 'summaryLogsRepository', (request) =>
        factory(request.logger)
      )
    }
  }

  return { plugin, repository }
}
