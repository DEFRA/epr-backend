import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'

/**
 * @typedef {Object} RepositoriesPluginOptions
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepositoryFactory} [summaryLogsRepository] - Optional test override for summary logs repository factory
 */

export const repositories = {
  plugin: {
    name: 'repositories',
    version: '1.0.0',
    /**
     * @param {import('#common/hapi-types.js').HapiServer} server
     * @param {RepositoriesPluginOptions} [options]
     */
    register: (server, options) => {
      /**
       * @param {import('#repositories/summary-logs/port.js').SummaryLogsRepositoryFactory} repositoryFactory
       */
      const decorateRepository = (repositoryFactory) => {
        server.ext('onRequest', (request, h) => {
          // Lazily create repository on first access
          Object.defineProperty(request, 'summaryLogsRepository', {
            get() {
              if (!this.app.summaryLogsRepository) {
                this.app.summaryLogsRepository = repositoryFactory(this.logger)
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
        decorateRepository(options.summaryLogsRepository)
      } else {
        server.dependency('mongodb', () => {
          const summaryLogsRepositoryFactory = createSummaryLogsRepository(
            server.db
          )
          decorateRepository(summaryLogsRepositoryFactory)
        })
      }
    }
  }
}
