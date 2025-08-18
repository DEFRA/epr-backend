import { health } from '../routes/health.js'
import { notify } from '../routes/notify.js'

import { organisation } from '../routes/organisation.js'
import { registration } from '../routes/registration.js'
import { accreditation } from '../routes/accreditation.js'
const router = {
  plugin: {
    name: 'router',
    register: (server, _options) => {
      server.route([health, notify, organisation, registration, accreditation])
    }
  }
}

export { router }
