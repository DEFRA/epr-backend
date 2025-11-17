import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'

/**
 * @typedef {Object} RepositoriesPluginOptions
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepositoryFactory} [summaryLogsRepository] - Optional test override for summary logs repository factory
 * @property {import('#repositories/organisations/port.js').OrganisationsRepositoryFactory} [organisationsRepository] - Optional test override for organisations repository factory
 * @property {import('#repositories/form-submissions/port.js').FormSubmissionsRepositoryFactory} [formSubmissionsRepository] - Optional test override for form submissions repository factory
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepositoryFactory} [wasteRecordsRepository] - Optional test override for waste records repository factory
 * @property {boolean} [skipMongoDb] - Set to true when MongoDB is not available (e.g., in-memory tests)
 * @property {{maxRetries: number, retryDelayMs: number}} [eventualConsistency] - Eventual consistency retry configuration
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

      /**
       * Registers a repository with optional test override.
       *
       * @param {string} name - Repository property name
       * @param {Function} productionFactoryCreator - Function that creates the production repository factory from db
       * @param {Function} [testFactory] - Optional test factory override from options
       */
      const registerRepository = (
        name,
        productionFactoryCreator,
        testFactory
      ) => {
        if (testFactory) {
          registerPerRequest(name, testFactory)
        } else if (!skipMongoDb) {
          server.dependency('mongodb', () => {
            const productionFactory = productionFactoryCreator(
              /** @type {import('mongodb').Db} */ (server.db)
            )
            registerPerRequest(name, productionFactory)
          })
        }
      }

      registerRepository(
        'summaryLogsRepository',
        createSummaryLogsRepository,
        options?.summaryLogsRepository
      )

      registerRepository(
        'organisationsRepository',
        (db) => createOrganisationsRepository(db, options?.eventualConsistency),
        options?.organisationsRepository
      )

      registerRepository(
        'formSubmissionsRepository',
        createFormSubmissionsRepository,
        options?.formSubmissionsRepository
      )

      registerRepository(
        'wasteRecordsRepository',
        createWasteRecordsRepository,
        options?.wasteRecordsRepository
      )
    }
  }
}
