import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'

/**
 * @typedef {Object} RepositoriesPluginOptions
 * @property {import('#repositories/summary-logs/port.js').SummaryLogsRepositoryFactory} [summaryLogsRepository] - Optional test override for summary logs repository factory
 * @property {import('#repositories/organisations/port.js').OrganisationsRepositoryFactory} [organisationsRepository] - Optional test override for organisations repository factory
 * @property {import('#repositories/form-submissions/port.js').FormSubmissionsRepositoryFactory} [formSubmissionsRepository] - Optional test override for form submissions repository factory
 * @property {import('#repositories/waste-records/port.js').WasteRecordsRepositoryFactory} [wasteRecordsRepository] - Optional test override for waste records repository factory
 * @property {import('#domain/uploads/repository/port.js').UploadsRepository} [uploadsRepository] - Optional test override for uploads repository
 * @property {boolean} [skipMongoDb] - Set to true when MongoDB is not available (e.g., in-memory tests)
 * @property {{maxRetries: number, retryDelayMs: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

/**
 * Registers the uploads repository with optional test override.
 * @param {import('#common/hapi-types.js').HapiServer} server
 * @param {RepositoriesPluginOptions} [options]
 * @param {boolean} [skipMongoDb]
 */
const registerUploadsRepository = (server, options, skipMongoDb) => {
  if (options?.uploadsRepository) {
    server.ext('onRequest', (request, h) => {
      Object.defineProperty(request, 'uploadsRepository', {
        get() {
          return options.uploadsRepository
        },
        enumerable: true,
        configurable: true
      })
      return h.continue
    })
  } else if (skipMongoDb) {
    // skipMongoDb is true and no test override - uploads repository not registered
    // This is intentional: tests using skipMongoDb must provide their own uploadsRepository
  } else {
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    const uploadsRepository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: config.get('cdpUploader.url'),
      s3Bucket: config.get('cdpUploader.s3Bucket')
    })

    server.ext('onRequest', (request, h) => {
      Object.defineProperty(request, 'uploadsRepository', {
        // istanbul ignore next -- production wiring, equivalent getter tested via options path
        get() {
          return uploadsRepository
        },
        enumerable: true,
        configurable: true
      })
      return h.continue
    })
  }
}

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
       * @param {Function} productionFactoryCreator - Function that creates the production repository factory from db (may be async)
       * @param {Function} [testFactory] - Optional test factory override from options
       */
      const registerRepository = (
        name,
        productionFactoryCreator,
        testFactory
      ) => {
        if (testFactory) {
          registerPerRequest(name, testFactory)
        } else if (skipMongoDb) {
          // No repository registered - test is skipping MongoDB and not providing a factory
        } else {
          server.dependency('mongodb', async () => {
            const productionFactory = await productionFactoryCreator(
              /** @type {import('mongodb').Db} */ (server.db)
            )
            registerPerRequest(name, productionFactory)
          })
        }
      }

      const repositoryFactories = {
        summaryLogsRepository: createSummaryLogsRepository,
        organisationsRepository: (db) =>
          createOrganisationsRepository(db, options?.eventualConsistency),
        formSubmissionsRepository: createFormSubmissionsRepository,
        systemLogsRepository: createSystemLogsRepository,
        wasteRecordsRepository: createWasteRecordsRepository,
        wasteBalancesRepository: async (db) => {
          const organisationsRepositoryFactory =
            await createOrganisationsRepository(
              db,
              options?.eventualConsistency
            )
          return createWasteBalancesRepository(db, {
            organisationsRepository: organisationsRepositoryFactory()
          })
        }
      }

      for (const [name, creator] of Object.entries(repositoryFactories)) {
        registerRepository(name, creator, options?.[name])
      }

      registerUploadsRepository(server, options, skipMongoDb)
    }
  }
}
