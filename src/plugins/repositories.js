import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    register: (server, options) => {
      const decorateRepository = (repoFactory) => {
        server.ext('onRequest', (request, h) => {
          // Lazily create repository on first access
          Object.defineProperty(request, 'summaryLogsRepository', {
            get() {
              if (!this.app.summaryLogsRepository) {
                this.app.summaryLogsRepository = repoFactory(this.logger)
              }
              return this.app.summaryLogsRepository
            },
            enumerable: true,
            configurable: true
          })
          return h.continue
        })
      }

      if (options?.summaryLogsRepository) {
        // Test override - expect a factory function
        decorateRepository(options.summaryLogsRepository)
      } else {
        // Production - require MongoDB plugin
        server.dependency('mongodb', () => {
          const summaryLogsRepoFactory = createSummaryLogsRepository(server.db)
          decorateRepository(summaryLogsRepoFactory)
        })
      }
    }
  }
}
