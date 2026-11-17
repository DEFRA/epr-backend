import { appRoutes } from '#plugins/router.js'
import {
  createRepositoryPlugin,
  createTestServer
} from '#test/create-test-server.js'
import { createMockExternalAccreditationsRepository } from '#test/mock-repositories.js'

import { createInMemoryPublicRegisterRepositoryPlugin } from '#adapters/repositories/public-register/inmemory.plugin.js'
import { createInMemoryUploadsRepositoryPlugin } from '#adapters/repositories/uploads/inmemory.plugin.js'
import { createInMemoryNonProdDataResetPlugin } from '#non-prod-data-reset/inmemory.plugin.js'
import { createInMemoryOverseasSitesRepositoryPlugin } from '#overseas-sites/index.js'
import { createInMemoryOrsImportsRepositoryPlugin } from '#overseas-sites/imports/repository/inmemory.js'
import { createInMemoryOrganisationReadRepositoryPlugin } from '#organisation-read-model/repository/inmemory.plugin.js'
import { createInMemoryPackagingRecyclingNotesRepositoryPlugin } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryReportsRepositoryPlugin } from '#reports/repository/inmemory.plugin.js'
import { prnEventsPlugin } from '#packaging-recycling-notes/application/prn-events.plugin.js'
import { createInMemoryFormSubmissionsRepositoryPlugin } from '#repositories/form-submissions/inmemory.plugin.js'
import { createInMemoryOrganisationsRepositoryPlugin } from '#repositories/organisations/inmemory.plugin.js'
import { createInMemorySummaryLogsRepositoryPlugin } from '#repositories/summary-logs/inmemory.plugin.js'
import { createInMemorySystemLogsRepositoryPlugin } from '#repositories/system-logs/inmemory.plugin.js'
import { createInMemoryWasteBalanceServicePlugin } from '#waste-balances/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepositoryPlugin } from '#waste-balances/repository/ledger-inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepositoryPlugin } from '#waste-records/repository/inmemory.plugin.js'

/** @import { CreateTestServerOptions, TestServer } from '#test/create-test-server.js' */

/**
 * Creates a test server for the whole app: every route, with every
 * repository in memory. Accepts the same overrides as `createTestServer`.
 *
 * @param {Omit<CreateTestServerOptions, 'routes' | 'plugins'>} [options]
 * @returns {Promise<TestServer>}
 */
export const createAppTestServer = (options = {}) =>
  createTestServer({
    ...options,
    routes: appRoutes,
    plugins: [
      createInMemoryOrganisationsRepositoryPlugin(),
      createInMemorySummaryLogsRepositoryPlugin(),
      createInMemoryFormSubmissionsRepositoryPlugin(),
      createInMemorySummaryLogRowStatesRepositoryPlugin(),
      createInMemoryLedgerRepositoryPlugin(),
      createInMemoryWasteBalanceServicePlugin(),
      createInMemorySystemLogsRepositoryPlugin(),
      createInMemoryUploadsRepositoryPlugin(),
      createInMemoryPublicRegisterRepositoryPlugin(),
      createInMemoryPackagingRecyclingNotesRepositoryPlugin(),
      createInMemoryReportsRepositoryPlugin(),
      createInMemoryOverseasSitesRepositoryPlugin(),
      createInMemoryOrsImportsRepositoryPlugin(),
      createInMemoryOrganisationReadRepositoryPlugin(),
      createInMemoryNonProdDataResetPlugin(),
      createRepositoryPlugin(
        'externalAccreditationsRepository',
        createMockExternalAccreditationsRepository()
      ),
      prnEventsPlugin
    ]
  })
