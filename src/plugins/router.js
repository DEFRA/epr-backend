import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { notify } from '../routes/notify.js'
import { testEndpointDXT } from '../routes/testEndpointDXT.js'
const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, notify, testEndpointDXT, ...example])
    }
  }
}

export { router }
