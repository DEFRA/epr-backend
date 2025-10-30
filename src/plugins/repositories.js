import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createApplicationsRepository } from '#repositories/applications/mongodb.js'

/**
 * @typedef {Object} RepositoriesPluginOptions
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepositoryFactory} [summaryLogsRepository] - Optional test override for summary logs repository factory
 * @property {import('#repositories/organisations/port.js').OrganisationsRepositoryFactory} [organisationsRepository] - Optional test override for organisations repository factory
 * @property {import('#repositories/applications/port.js').ApplicationsRepositoryFactory} [applicationsRepository] - Optional test override for applications repository factory
 * @property {boolean} [skipMongoDb] - Set to true when MongoDB is not available (e.g., in-memory tests)
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
      const skipMongoDb = options?.skipMongoDb ?? false
      /**
       * Registers a per-request dependency with logger injection.
       * Uses lazy initialization to defer creation until first access, and caches
       * the instance in request.app to ensure the same instance is used throughout
       * the request lifecycle. This allows dependencies to log using the request's
       * logger without handlers needing to pass it through the dependency chain.
       *
       * @param {string} name - Property name to add to the request object
       * @param {Function} factory - Factory function that accepts a logger and returns the dependency
       */
      const registerPerRequest = (name, factory) => {
        server.ext('onRequest', (request, h) => {
          Object.defineProperty(request, name, {
            get() {
              if (!this.app[name]) {
                this.app[name] = factory(this.logger)
              }
              return this.app[name]
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
        registerPerRequest(
          'summaryLogsRepository',
          summaryLogsRepositoryFactory
        )
      } else if (skipMongoDb) {
        // No repository registered - test is skipping MongoDB and not providing a factory
      } else {
        server.dependency('mongodb', () => {
          const productionFactory = createSummaryLogsRepository(
            /** @type {import('mongodb').Db} */ (server.db)
          )
          registerPerRequest('summaryLogsRepository', productionFactory)
        })
      }

      const organisationsRepositoryFactory = options?.organisationsRepository
        ? options.organisationsRepository
        : null

      if (organisationsRepositoryFactory) {
        registerPerRequest(
          'organisationsRepository',
          organisationsRepositoryFactory
        )
      } else if (skipMongoDb) {
        // No repository registered - test is skipping MongoDB and not providing a factory
      } else {
        server.dependency('mongodb', () => {
          const productionFactory = createOrganisationsRepository(
            /** @type {import('mongodb').Db} */ (server.db)
          )
          registerPerRequest('organisationsRepository', productionFactory)
        })
      }

      const applicationsRepositoryFactory = options?.applicationsRepository
        ? options.applicationsRepository
        : null

      if (applicationsRepositoryFactory) {
        registerPerRequest(
          'applicationsRepository',
          applicationsRepositoryFactory
        )
      } else if (skipMongoDb) {
        // No repository registered - test is skipping MongoDB and not providing a factory
      } else {
        server.dependency('mongodb', () => {
          const productionFactory = createApplicationsRepository(
            /** @type {import('mongodb').Db} */ (server.db)
          )
          registerPerRequest('applicationsRepository', productionFactory)
        })
      }
    }
  }
}
