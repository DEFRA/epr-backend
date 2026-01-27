import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'

/**
 * In-memory summary logs repository adapter plugin for testing.
 * Registers the summary logs repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This repository requires per-request instantiation because it needs
 * the request's logger for error logging during update conflicts.
 * The repository is lazily created on first access and cached for the
 * duration of the request.
 */
export const inMemorySummaryLogsRepositoryPlugin = {
  name: 'summaryLogsRepository',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: (server) => {
    const factory = createInMemorySummaryLogsRepository()

    server.ext('onRequest', (request, h) => {
      let cached

      Object.defineProperty(request, 'summaryLogsRepository', {
        get() {
          if (!cached) {
            cached = factory(request.logger)
          }
          return cached
        },
        enumerable: true,
        configurable: true
      })
      return h.continue
    })
  }
}
