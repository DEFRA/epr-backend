import { health } from '#routes/health.js'
import { apply } from '#routes/v1/apply/index.js'
import * as summaryLogsRoutes from '#routes/v1/organisations/registrations/summary-logs/index.js'
import * as organisationRoutes from '#routes/v1/organisations/index.js'
import { formSubmissionsRoutes } from '#routes/v1/form-submissions/index.js'

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

        const organisationRoutesBehindFeatureFlag =
          featureFlags.isOrganisationRoutesEnabled()
            ? Object.values(organisationRoutes)
            : []

        server.route([
          health,
          ...apply,
          ...summaryLogsRoutesBehindFeatureFlag,
          ...organisationRoutesBehindFeatureFlag,
          ...formSubmissionsRoutes
        ])
      })
    }
  }
}

export { router }
