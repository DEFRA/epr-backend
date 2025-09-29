import { health } from '../routes/health.js'
import { apply } from '../routes/v1/apply/index.js'
import { summaryLogsRoutes } from '../routes/v1/organisations'
import { config } from '../config.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      const summaryLogsRoutesBehindFeatureFlag = config.get(
        'featureFlags.summaryLogs'
      )
        ? Object.values(summaryLogsRoutes)
        : []

      server.route([health, ...apply, ...summaryLogsRoutesBehindFeatureFlag])
    }
  }
}

export { router }
