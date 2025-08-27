import { health } from '../routes/health.js'
import { apply } from '../routes/v1/apply/index.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, ...apply])
    }
  }
}

export { router }
