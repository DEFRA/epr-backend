import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/mongodb.js'
import { createWasteRecordsRepository } from '#repositories/waste-records/mongodb.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { createUploadsRepository } from '#adapters/repositories/uploads/cdp-uploader.js'
import { createPublicRegisterRepository } from '#adapters/repositories/public-register/public-register.js'
import { createS3Client } from '#common/helpers/s3/s3-client.js'
import { config } from '#root/config.js'
import { publicRegisterConfig } from '#adapters/repositories/public-register/config.js'

/**
 * @typedef {Object} MongoRepositoriesPluginOptions
 * @property {{maxRetries?: number, retryDelayMs?: number}} [eventualConsistency] - Eventual consistency retry configuration
 */

/**
 * MongoDB repositories adapter plugin for production.
 * Provides the same interface as the in-memory repositories plugin but uses
 * MongoDB-backed storage. Repositories that need request context (e.g. logger)
 * are created per-request; stateless repositories are shared.
 */
export const mongoRepositoriesPlugin = {
  name: 'repositories',
  version: '1.0.0',
  dependencies: ['mongodb'],

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {MongoRepositoriesPluginOptions} [options]
   */
  register: async (server, options = {}) => {
    const db = server.db

    // Create repository factories (async - need to await for index creation)
    const summaryLogsFactory = await createSummaryLogsRepository(db)
    const organisationsFactory = await createOrganisationsRepository(
      db,
      options.eventualConsistency
    )
    const formSubmissionsFactory = await createFormSubmissionsRepository(db)
    const wasteRecordsFactory = await createWasteRecordsRepository(db)
    const systemLogsFactory = await createSystemLogsRepository(db)

    // wasteBalances depends on organisations repository
    const wasteBalancesFactory = await createWasteBalancesRepository(db, {
      organisationsRepository: organisationsFactory()
    })

    // Create S3 client for uploads and public register
    const s3Client = createS3Client({
      region: config.get('awsRegion'),
      endpoint: config.get('s3Endpoint'),
      forcePathStyle: config.get('isDevelopment')
    })

    // These repositories don't use a factory pattern - create directly
    const uploadsRepository = createUploadsRepository({
      s3Client,
      cdpUploaderUrl: config.get('cdpUploader.url'),
      s3Bucket: config.get('cdpUploader.s3Bucket')
    })

    const publicRegisterRepository = createPublicRegisterRepository({
      s3Client,
      s3Bucket: publicRegisterConfig.s3Bucket,
      preSignedUrlExpiry: publicRegisterConfig.preSignedUrlExpiry
    })

    // Register per-request repositories via onRequest extension
    // This provides request.repositories with lazily-created, cached instances
    server.ext('onRequest', (request, h) => {
      /** @type {Record<string, unknown>} */
      const repositoriesCache = {}

      Object.defineProperty(request, 'repositories', {
        get() {
          return {
            get summaryLogs() {
              if (!repositoriesCache.summaryLogs) {
                repositoriesCache.summaryLogs = summaryLogsFactory(
                  request.logger
                )
              }
              return repositoriesCache.summaryLogs
            },
            get organisations() {
              if (!repositoriesCache.organisations) {
                repositoriesCache.organisations = organisationsFactory()
              }
              return repositoriesCache.organisations
            },
            get formSubmissions() {
              if (!repositoriesCache.formSubmissions) {
                repositoriesCache.formSubmissions = formSubmissionsFactory()
              }
              return repositoriesCache.formSubmissions
            },
            get wasteRecords() {
              if (!repositoriesCache.wasteRecords) {
                repositoriesCache.wasteRecords = wasteRecordsFactory()
              }
              return repositoriesCache.wasteRecords
            },
            get wasteBalances() {
              if (!repositoriesCache.wasteBalances) {
                repositoriesCache.wasteBalances = wasteBalancesFactory()
              }
              return repositoriesCache.wasteBalances
            },
            get systemLogs() {
              if (!repositoriesCache.systemLogs) {
                repositoriesCache.systemLogs = systemLogsFactory(request.logger)
              }
              return repositoriesCache.systemLogs
            },
            get uploads() {
              return uploadsRepository
            },
            get publicRegister() {
              return publicRegisterRepository
            }
          }
        },
        enumerable: true,
        configurable: true
      })

      return h.continue
    })
  }
}
