import { health } from '#routes/health.js'
import { apply } from '#routes/v1/apply/index.js'
import { summaryLogsRoutes } from '#routes/v1/organisations/index.js'

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

        server.route([health, ...apply, ...summaryLogsRoutesBehindFeatureFlag])
      })
    }
  }
}

export { router }
