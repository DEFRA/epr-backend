import { health } from '../routes/health.js'
import { example } from '../routes/example.js'
import { notify } from '../routes/notify.js'

import { signup } from '../routes/signup.js'
import { registration } from '../routes/registration.js'
import { accreditation } from '../routes/accreditation.js'
const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([
        health,
        notify,
        signup,
        registration,
        accreditation,
        ...example
      ])
    }
  }
}

export { router }
