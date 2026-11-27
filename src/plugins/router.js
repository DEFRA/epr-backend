import { health } from '#routes/health.js'
import { apply } from '#routes/v1/apply/index.js'
import * as organisationViewRoutes from '#routes/organisations/index.js'
import * as meRoutes from '#routes/v1/me/index.js'
import * as devRoutes from '#routes/v1/dev/index.js'
import { formSubmissionsRoutes } from '#routes/v1/form-submissions/index.js'
import * as systemLogsRoutes from '#routes/v1/system-logs/index.js'
import * as wasteBalanceRoutes from '#waste-balances/routes/index.js'
import { wasteBalanceRoutesByNaturalKey } from '#waste-balances/routes/by-natural-key.js'
import { generateLatestPublicRegister } from '#public-register/index.js'
import * as tonnageMonitoringRoutes from '#routes/v1/tonnage-monitoring/index.js'
import * as wasteBalanceAvailabilityRoutes from '#routes/v1/waste-balance-availability/index.js'
import * as overseasSitesRoutes from '#overseas-sites/routes/index.js'
import * as marketInsightsRoutes from '#market-insights/routes/index.js'
import * as linkedOrganisationsRoutes from '#routes/v1/linked-organisations/index.js'
import { summaryLogRoutesByNaturalKey } from '#routes/v1/organisations/registrations/summary-logs/by-natural-key.js'
import { summaryLogUploadsReportRoutes } from '#routes/v1/organisations/registrations/summary-logs/reports/uploads/index.js'
import * as reportsRoutes from '#reports/routes/index.js'
import { reportRoutesByNaturalKey } from '#reports/routes/by-natural-key.js'
import { adminMeGet } from '#routes/v1/admin/me/get.js'
import { dlqMessagesGet } from '#routes/v1/admin/queues/dlq/messages.get.js'
import { dlqPurgePost } from '#routes/v1/admin/queues/dlq/purge.post.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, options) => {
      const devRoutesBehindFeatureFlag = options.config.get(
        'featureFlags.devEndpoints'
      )
        ? Object.values(devRoutes)
        : []

      server.route([
        health,
        ...apply,
        ...Object.values(meRoutes),
        ...summaryLogRoutesByNaturalKey,
        ...devRoutesBehindFeatureFlag,
        ...Object.values(organisationViewRoutes),
        ...formSubmissionsRoutes,
        ...Object.values(systemLogsRoutes),
        ...Object.values(wasteBalanceRoutes),
        ...wasteBalanceRoutesByNaturalKey,
        generateLatestPublicRegister,
        ...Object.values(tonnageMonitoringRoutes),
        ...Object.values(wasteBalanceAvailabilityRoutes),
        ...Object.values(linkedOrganisationsRoutes),
        ...summaryLogUploadsReportRoutes,
        ...Object.values(overseasSitesRoutes),
        ...Object.values(marketInsightsRoutes),
        ...Object.values(reportsRoutes),
        ...reportRoutesByNaturalKey,
        adminMeGet,
        dlqMessagesGet,
        dlqPurgePost
      ])
    }
  }
}

export { router }
