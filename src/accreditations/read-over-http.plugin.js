import { registerDependency } from '#plugins/register-dependency.js'
import { createHttpAccreditationsSource } from './adapters/http.js'
import { withAccreditationsFrom } from './application/with-accreditations-from.js'

/**
 * POC (PAE-1965): swaps `organisationsRepository` for one whose reads fetch
 * accreditations over HTTP from the accreditation endpoints, which this
 * service serves itself at `appBaseUrl`.
 *
 * The endpoints read `localOrganisationsRepository` — the repository as it was
 * before the swap — so serving a request never calls back over HTTP.
 */
export const readAccreditationsOverHttpPlugin = {
  name: 'readAccreditationsOverHttp',
  version: '1.0.0',
  dependencies: ['organisationsRepository'],

  register: async (
    /** @type {import('#common/hapi-types.js').HapiServer} */ server,
    /** @type {{ config: import('convict').Config<Record<string, any>> }} */ {
      config
    }
  ) => {
    const hapiServer = /** @type {import('@hapi/hapi').Server} */ (
      /** @type {unknown} */ (server)
    )
    const local = server.app.organisationsRepository
    const source = createHttpAccreditationsSource({
      baseUrl: config.get('appBaseUrl'),
      username: config.get('basicAuth.username'),
      password: config.get('basicAuth.password')
    })
    const decorated = withAccreditationsFrom(local, source)

    registerDependency(hapiServer, 'localOrganisationsRepository', () => local)
    registerDependency(hapiServer, 'organisationsRepository', () => decorated)
  }
}
