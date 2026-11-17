import { health } from '#routes/health.js'
import { apply } from '#routes/v1/apply/index.js'
import * as organisationRoutes from '#routes/v1/organisations/index.js'
import * as organisationViewRoutes from '#routes/organisations/index.js'
import * as meRoutes from '#routes/v1/me/index.js'
import * as devRoutes from '#routes/v1/dev/index.js'
import { formSubmissionsRoutes } from '#routes/v1/form-submissions/index.js'
import * as systemLogsRoutes from '#routes/v1/system-logs/index.js'
import * as wasteBalanceRoutes from '#waste-balances/routes/index.js'
import { wasteBalanceRoutesByNaturalKey } from '#waste-balances/routes/by-natural-key.js'
import {
  wasteRecordsExportRoute,
  registrationWasteRecordsExportByNumber,
  availableWasteRecordYearsGet
} from '#waste-records-export/index.js'
import * as publicRegisterRoutes from '#routes/v1/public-register/index.js'
import * as tonnageMonitoringRoutes from '#routes/v1/tonnage-monitoring/index.js'
import * as prnTonnageRoutes from '#routes/v1/prn-tonnage/index.js'
import * as wasteBalanceAvailabilityRoutes from '#routes/v1/waste-balance-availability/index.js'
import * as overseasSitesRoutes from '#overseas-sites/routes/index.js'
import * as marketInsightsRoutes from '#market-insights/routes/index.js'
import { packagingRecyclingNotesRoutes } from '#packaging-recycling-notes/routes/index.js'
import * as linkedOrganisationsRoutes from '#routes/v1/linked-organisations/index.js'
import { summaryLogRoutesByNaturalKey } from '#routes/v1/organisations/registrations/summary-logs/by-natural-key.js'
import { summaryLogUploadsReportRoutes } from '#routes/v1/organisations/registrations/summary-logs/reports/uploads/index.js'
import * as reportsRoutes from '#reports/routes/index.js'
import { reportRoutesByNaturalKey } from '#reports/routes/by-natural-key.js'
import { adminMeGet } from '#routes/v1/admin/me/get.js'
import { dlqMessagesGet } from '#routes/v1/admin/queues/dlq/messages.get.js'
import { dlqPurgePost } from '#routes/v1/admin/queues/dlq/purge.post.js'

/**
 * Every route the app serves.
 *
 * @param {import('convict').Config<Record<string, any>>} config
 */
const appRoutes = (config) => {
  const devRoutesBehindFeatureFlag = config.get('featureFlags.devEndpoints')
    ? Object.values(devRoutes)
    : []

  return [
    health,
    ...apply,
    ...Object.values(meRoutes),
    ...summaryLogRoutesByNaturalKey,
    ...devRoutesBehindFeatureFlag,
    ...Object.values(organisationRoutes),
    ...Object.values(organisationViewRoutes),
    ...formSubmissionsRoutes,
    ...Object.values(systemLogsRoutes),
    ...Object.values(wasteBalanceRoutes),
    ...wasteBalanceRoutesByNaturalKey,
    wasteRecordsExportRoute,
    registrationWasteRecordsExportByNumber,
    availableWasteRecordYearsGet,
    ...Object.values(publicRegisterRoutes),
    ...Object.values(tonnageMonitoringRoutes),
    ...Object.values(prnTonnageRoutes),
    ...Object.values(wasteBalanceAvailabilityRoutes),
    ...Object.values(linkedOrganisationsRoutes),
    ...packagingRecyclingNotesRoutes(config),
    ...summaryLogUploadsReportRoutes,
    ...Object.values(overseasSitesRoutes),
    ...Object.values(marketInsightsRoutes),
    ...Object.values(reportsRoutes),
    ...reportRoutesByNaturalKey,
    adminMeGet,
    dlqMessagesGet,
    dlqPurgePost
  ]
}

const router = {
  plugin: {
    name: 'router',
    register: (server, options) => {
      server.route(appRoutes(options.config))
    }
  }
}

export { appRoutes, router }
