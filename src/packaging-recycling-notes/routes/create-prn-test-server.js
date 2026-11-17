import { createTestServer } from '#test/create-test-server.js'
import { prnEventsPlugin } from '#packaging-recycling-notes/application/prn-events.plugin.js'
import { createInMemoryPackagingRecyclingNotesRepositoryPlugin } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryOrganisationReadRepositoryPlugin } from '#organisation-read-model/repository/inmemory.plugin.js'
import { createInMemoryOrganisationsRepositoryPlugin } from '#repositories/organisations/inmemory.plugin.js'
import { createInMemorySystemLogsRepositoryPlugin } from '#repositories/system-logs/inmemory.plugin.js'
import { createInMemoryReportsRepositoryPlugin } from '#reports/repository/inmemory.plugin.js'
import { createInMemoryLedgerRepositoryPlugin } from '#waste-balances/repository/ledger-inmemory.plugin.js'
import { packagingRecyclingNotesRoutes } from './index.js'

/** @import { CreateTestServerOptions, TestServer } from '#test/create-test-server.js' */

/**
 * Creates a test server serving only the PRN routes, with every repository
 * they use in memory. Accepts the same overrides as `createTestServer`.
 *
 * @param {Omit<CreateTestServerOptions, 'routes' | 'plugins'>} [options]
 * @returns {Promise<TestServer>}
 */
export const createPrnTestServer = (options = {}) =>
  createTestServer({
    ...options,
    routes: packagingRecyclingNotesRoutes,
    plugins: [
      createInMemoryPackagingRecyclingNotesRepositoryPlugin(),
      createInMemoryLedgerRepositoryPlugin(),
      createInMemoryOrganisationsRepositoryPlugin(),
      createInMemoryOrganisationReadRepositoryPlugin(),
      createInMemoryReportsRepositoryPlugin(),
      createInMemorySystemLogsRepositoryPlugin(),
      prnEventsPlugin
    ]
  })
