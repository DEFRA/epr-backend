import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { notify } from '../routes/notify.js'


const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, notify, ...example])
    }
  }
}

export { router }
