import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

/**
 * MongoDB summary logs repository adapter plugin.
 * Registers the summary logs repository directly on the request object,
 * matching the existing access pattern used by route handlers.
 *
 * This repository requires per-request instantiation because it needs
 * the request's logger for error logging during update conflicts.
 * The repository is lazily created on first access and cached for the
 * duration of the request.
 */
export const mongoSummaryLogsRepositoryPlugin = {
  name: 'summaryLogsRepository',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: async (server) => {
    const factory = await createSummaryLogsRepository(server.db)

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
