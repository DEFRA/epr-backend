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

/**
 * Creates an in-memory summary logs repository plugin for testing.
 * Returns both the plugin (for server registration) and the repository
 * (for direct test access to insert/query data).
 *
 * The repository requires per-request instantiation for logging during
 * update conflicts. Storage is shared between the test instance (with
 * noop logger) and per-request instances (with request.logger).
 *
 * @returns {{ plugin: import('@hapi/hapi').Plugin<void>, repository: import('#repositories/summary-logs/port.js').SummaryLogsRepository }}
 */
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
