import { health } from '#routes/health.js'
import { apply } from '#routes/v1/apply/index.js'
import * as summaryLogsRoutes from '#routes/v1/organisations/registrations/summary-logs/index.js'
import * as organisationRoutes from '#routes/v1/organisations/index.js'
import * as meRoutes from '#routes/v1/me/index.js'
import * as devRoutes from '#routes/v1/dev/index.js'
import { formSubmissionsRoutes } from '#routes/v1/form-submissions/index.js'
import * as systemLogsRoutes from '#routes/v1/system-logs/index.js'
import { wasteBalance } from '#routes/v1/organisations/waste-balances/index.js'

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

        server.route([
          health,
          ...apply,
          ...Object.values(meRoutes),
          ...summaryLogsRoutesBehindFeatureFlag,
          ...devRoutesBehindFeatureFlag,
          ...Object.values(organisationRoutes),
          ...formSubmissionsRoutes,
          ...Object.values(systemLogsRoutes),
          ...wasteBalance
        ])
      })
    }
  }
}

export { router }
