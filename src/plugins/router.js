import { health } from '#routes/health.js'
import { apply } from '#routes/v1/apply/index.js'
import * as summaryLogsRoutes from '#routes/v1/organisations/registrations/summary-logs/index.js'
import * as organisationRoutes from '#routes/v1/organisations/index.js'
import * as meRoutes from '#routes/v1/me/index.js'
import * as devRoutes from '#routes/v1/dev/index.js'
import { formSubmissionsRoutes } from '#routes/v1/form-submissions/index.js'
import * as systemLogsRoutes from '#routes/v1/system-logs/index.js'
import { wasteBalances } from '#routes/v1/organisations/waste-balances/index.js'
import * as publicRegisterRoutes from '#routes/v1/public-register/index.js'
import * as tonnageMonitoringRoutes from '#routes/v1/tonnage-monitoring/index.js'
import { packagingRecyclingNotesAccept } from '#packaging-recycling-notes/routes/accept.js'
import { packagingRecyclingNotesList } from '#packaging-recycling-notes/routes/list.js'
import { packagingRecyclingNotesReject } from '#packaging-recycling-notes/routes/reject.js'
import * as linkedOrganisationsRoutes from '#routes/v1/linked-organisations/index.js'
import * as packagingRecyclingNotesRoutes from '#packaging-recycling-notes/routes/index.js'
import { summaryLogUploadsReportRoutes } from '#routes/v1/organisations/registrations/summary-logs/reports/uploads/index.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, options) => {
      server.dependency('feature-flags', () => {
        const featureFlags = options.featureFlags || server.featureFlags

        const summaryLogsRoutesBehindFeatureFlag =
          featureFlags.isSummaryLogsEnabled()
            ? Object.values(summaryLogsRoutes)
            : []

        const devRoutesBehindFeatureFlag = featureFlags.isDevEndpointsEnabled()
          ? Object.values(devRoutes)
          : []

        const packagingRecyclingNotesRoutesBehindFeatureFlag =
          featureFlags.isCreatePackagingRecyclingNotesEnabled()
            ? Object.values(packagingRecyclingNotesRoutes)
            : []

        const packagingRecyclingNotesExternalApiRoutesBehindFeatureFlag =
          featureFlags.isPackagingRecyclingNotesExternalApiEnabled()
            ? [
                packagingRecyclingNotesAccept,
                packagingRecyclingNotesList,
                packagingRecyclingNotesReject
              ]
            : []

        server.route([
          health,
          ...apply,
          ...Object.values(meRoutes),
          ...summaryLogsRoutesBehindFeatureFlag,
          ...devRoutesBehindFeatureFlag,
          ...Object.values(organisationRoutes),
          ...formSubmissionsRoutes,
          ...Object.values(systemLogsRoutes),
          ...wasteBalances,
          ...Object.values(publicRegisterRoutes),
          ...Object.values(tonnageMonitoringRoutes),
          ...Object.values(linkedOrganisationsRoutes),
          ...packagingRecyclingNotesRoutesBehindFeatureFlag,
          ...packagingRecyclingNotesExternalApiRoutesBehindFeatureFlag,
          ...summaryLogUploadsReportRoutes
        ])
      })
    }
  }
}

export { router }
