import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

/**
 * @typedef {Object} RepositoriesPluginOptions
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepositoryFactory} [summaryLogsRepository] - Optional test override for summary logs repository factory
 * @property {import('#repositories/organisations/port.js').OrganisationsRepositoryFactory} [organisationsRepository] - Optional test override for organisations repository factory
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
       * Enables automatic per-request repository creation with logger injection.
       * Uses lazy initialization to defer creation until first access, and caches
       * the instance in request.app to ensure the same repository is used throughout
       * the request lifecycle. This allows repositories to log using the request's
       * logger without handlers needing to pass it through the dependency chain.
       *
       * @param {string} repositoryName
       * @param {Function} repositoryFactory
       */
      const enablePerRequestRepositoryWithLogger = (
        repositoryName,
        repositoryFactory
      ) => {
        server.ext('onRequest', (request, h) => {
          Object.defineProperty(request, repositoryName, {
            get() {
              if (!this.app[repositoryName]) {
                this.app[repositoryName] = repositoryFactory(this.logger)
              }
              return this.app[repositoryName]
            },
            enumerable: true,
            configurable: true
          })
          return h.continue
        })
      }

      const summaryLogsRepositoryFactory = options?.summaryLogsRepository
        ? options.summaryLogsRepository
        : null

      if (summaryLogsRepositoryFactory) {
        enablePerRequestRepositoryWithLogger(
          'summaryLogsRepository',
          summaryLogsRepositoryFactory
        )
      } else {
        server.dependency('mongodb', () => {
          const productionFactory = createSummaryLogsRepository(server.db)
          enablePerRequestRepositoryWithLogger(
            'summaryLogsRepository',
            productionFactory
          )
        })
      }

      const organisationsRepositoryFactory = options?.organisationsRepository
        ? options.organisationsRepository
        : null

      if (organisationsRepositoryFactory) {
        enablePerRequestRepositoryWithLogger(
          'organisationsRepository',
          organisationsRepositoryFactory
        )
      } else {
        server.dependency('mongodb', () => {
          const productionFactory = createOrganisationsRepository(server.db)
          enablePerRequestRepositoryWithLogger(
            'organisationsRepository',
            productionFactory
          )
        })
      }
    }
  }
}
