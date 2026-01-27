import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemoryPublicRegisterRepository } from '#adapters/repositories/public-register/inmemory.js'

/**
 * @typedef {Object} InMemoryRepositoriesPluginOptions
 * @property {Object[]} [initialOrganisations] - Initial organisations data
 * @property {Object[]} [initialSummaryLogs] - Initial summary logs data
 */

/**
 * In-memory repositories adapter plugin for testing.
 * Provides the same interface as the MongoDB repositories plugin but uses
 * in-memory storage. Repositories that need request context (e.g. logger)
 * are created per-request; stateless repositories are shared.
 */
export const inMemoryRepositoriesPlugin = {
  name: 'repositories',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {InMemoryRepositoriesPluginOptions} [options]
   */
  register: (server, options = {}) => {
    // Create repository factories (outer functions)
    const summaryLogsFactory = createInMemorySummaryLogsRepository()
    const organisationsFactory = createInMemoryOrganisationsRepository(
      options.initialOrganisations
    )
    const formSubmissionsFactory = createFormSubmissionsRepository()
    const wasteRecordsFactory = createInMemoryWasteRecordsRepository()
    const systemLogsFactory = createSystemLogsRepository()

    // wasteBalances depends on organisations repository
    const wasteBalancesFactory = createInMemoryWasteBalancesRepository({
      organisationsRepository: organisationsFactory()
    })

    // These repositories don't use a factory pattern - create directly
    const uploadsRepository = createInMemoryUploadsRepository()
    const publicRegisterRepository = createInMemoryPublicRegisterRepository()

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
                repositoriesCache.systemLogs = systemLogsFactory()
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
