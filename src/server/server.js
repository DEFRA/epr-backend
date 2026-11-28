import Hapi from '@hapi/hapi'

import { dlqAdminPlugin } from '#plugins/dlq-admin.js'
import { s3PublicRegisterRepositoryPlugin } from '#public-register/index.js'
import { s3UploadsRepositoryPlugin } from '#adapters/repositories/uploads/s3.plugin.js'
import { sqsCommandExecutorPlugin } from '#adapters/sqs-command-executor/sqs-command-executor.plugin.js'
import { failAction } from '#common/helpers/fail-action.js'
import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { mongoDbPlugin } from '#common/helpers/plugins/mongo-db-plugin.js'
import { setupProxy } from '#common/helpers/proxy/setup-proxy.js'
import { mongoExternalAccreditationsRepositoryPlugin } from '#external-accreditations/repository/mongodb.plugin.js'
import { nonProdDataResetPlugin } from '#non-prod-data-reset/mongodb.plugin.js'
import {
  orsImportsRepositoryPlugin,
  overseasSitesRepositoryPlugin
} from '#overseas-sites/index.js'
import {
  packagingRecyclingNotesRepositoryPlugin,
  prnEventsPlugin,
  reconcileStalePrnProjectionsPlugin
} from '#packaging-recycling-notes/plugin.js'
import { serverPlugins } from '#plugins/server-plugins.js'
import { mongoFormSubmissionsRepositoryPlugin } from '#repositories/form-submissions/mongodb.plugin.js'
import { mongoOrganisationsRepositoryPlugin } from '#repositories/organisations/mongodb.plugin.js'
import { organisationReadRepositoryPlugin } from '#organisation-read-model/plugin.js'
import { registrationAccreditationAdminRepositoryPlugin } from '#registration-accreditation-admin/plugin.js'
import { mongoSummaryLogsRepositoryPlugin } from '#repositories/summary-logs/mongodb.plugin.js'
import { mongoSystemLogsRepositoryPlugin } from '#repositories/system-logs/mongodb.plugin.js'
import { mongoLedgerRepositoryPlugin } from '#waste-balances/repository/ledger-mongodb.plugin.js'
import { mongoWasteBalanceServicePlugin } from '#waste-balances/repository/mongodb.plugin.js'
import { mongoSummaryLogRowStatesRepositoryPlugin } from '#waste-records/repository/mongodb.plugin.js'
import { mongoReportsRepositoryPlugin } from '#reports/repository/mongodb.plugin.js'
import { getConfig } from '#root/config.js'
import { commandQueueConsumerPlugin } from '#server/queue-consumer/queue-consumer.plugin.js'
import { runFormsDataMigration } from '#server/run-forms-data-migration.js'
import { seedDatabase } from '#server/seed/seed-database.js'

/** @import { Lifecycle } from '@hapi/hapi' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-api.js' */

function getServerConfig(config) {
  return {
    host: config.get('host'),
    port: config.get('port'),
    debug: config.get('debug'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        },
        // Cast bridges HapiRequest (typed logger) to Hapi's plain Request signature.
        failAction: /** @type {Lifecycle.FailAction} */ (
          /** @type {unknown} */ (failAction)
        )
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: /** @type {'enabled'} */ ('enabled'),
        noSniff: true,
        xframe: /** @type {true} */ (true)
      }
    },
    router: {
      stripTrailingSlash: true
    }
  }
}

/**
 * The Reg Accred API's settings when Reg Accred supplies external
 * accreditations, otherwise nothing.
 *
 * @param {{ get: (key: string) => unknown }} config
 * @returns {RegAccredApiConfig | undefined}
 */
function regAccredApiOf(config) {
  return config.get('featureFlags.regAccredExternalAccreditations')
    ? /** @type {RegAccredApiConfig} */ (config.get('regAccredApi'))
    : undefined
}

function getProductionPlugins(config) {
  const eventualConsistency = config.get('mongo.eventualConsistency')

  const plugins = [
    {
      plugin: mongoDbPlugin,
      options: { ...config.get('mongo'), seedDatabase }
    },
    {
      plugin: mongoOrganisationsRepositoryPlugin,
      options: { eventualConsistency }
    },
    registrationAccreditationAdminRepositoryPlugin,
    mongoSummaryLogsRepositoryPlugin,
    mongoFormSubmissionsRepositoryPlugin,
    mongoLedgerRepositoryPlugin,
    mongoWasteBalanceServicePlugin,
    mongoSystemLogsRepositoryPlugin,
    s3UploadsRepositoryPlugin,
    s3PublicRegisterRepositoryPlugin,
    { plugin: sqsCommandExecutorPlugin, options: { config } },
    { plugin: dlqAdminPlugin, options: { config } },
    overseasSitesRepositoryPlugin,
    {
      plugin: organisationReadRepositoryPlugin,
      options: { regAccredApi: regAccredApiOf(config) }
    },
    orsImportsRepositoryPlugin,
    mongoSummaryLogRowStatesRepositoryPlugin,
    {
      plugin: packagingRecyclingNotesRepositoryPlugin,
      options: { excludeOrganisationNumbers: TEST_ORGANISATION_NUMBERS }
    },
    reconcileStalePrnProjectionsPlugin
  ]

  plugins.push(mongoReportsRepositoryPlugin, prnEventsPlugin)

  /* istanbul ignore next -- gated by feature flag, only loaded in non-prod envs */
  if (config.get('featureFlags.devEndpoints')) {
    plugins.push(
      nonProdDataResetPlugin,
      mongoExternalAccreditationsRepositoryPlugin
    )
  }

  plugins.push({
    plugin: commandQueueConsumerPlugin,
    options: { config }
  })

  return plugins
}

async function createServer(options = {}) {
  setupProxy()
  const config = getConfig()
  const server = Hapi.server(getServerConfig(config))

  server.decorate('request', 'config', () => config, { apply: true })

  // LEGACY: Skip MongoDB, repositories and workers for tests of /v1/apply/* routes.
  // These routes reach their collections directly and need refactoring.
  // Once refactored, delete this flag and the server-with-mock-db.js fixture.
  // See: src/routes/v1/apply/*.js
  const legacyApplyRoutes = Boolean(options._testOnlyLegacyApplyRoutes)
  const infrastructure = legacyApplyRoutes ? [] : getProductionPlugins(config)

  await server.register(
    serverPlugins(config, infrastructure, { modules: !legacyApplyRoutes })
  )

  server.ext('onPostStart', () => {
    const startedServer = /** @type {StartedServer} */ (
      /** @type {unknown} */ (server)
    )
    void runFormsDataMigration(startedServer)
  })

  return server
}

export { createServer }
