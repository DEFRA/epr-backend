import { health } from '../routes/health.js'
import { notify } from '../routes/notify.js'
import { apply } from '../routes/v1/apply/index.js'

const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, notify, ...apply])
    }
  }
}

export { router }
