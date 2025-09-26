import { health } from '../routes/health.js'
import { apply } from '../routes/v1/apply/index.js'
import { summaryLogsRoutes } from '../routes/v1/organisations'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      const summaryLogsRoutesBehindFeatureFlag =
        process.env.FEATURE_FLAG_SUMMARY_LOGS === 'true'
          ? Object.values(summaryLogsRoutes)
          : []

      server.route([health, ...apply, ...summaryLogsRoutesBehindFeatureFlag])
    }
  }
}

export { router }
