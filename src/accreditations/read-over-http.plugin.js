import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createHttpAccreditationsSource } from './adapters/http.js'
import { withAccreditationsFrom } from './application/with-accreditations-from.js'

/** @import { HapiServer } from '#common/hapi-types.js' */
/** @import { MongoClient, Db } from 'mongodb' */

/**
 * POC (PAE-1965): swaps `organisationsRepository` for one whose reads fetch
 * accreditations over HTTP from the accreditation endpoints, which this
 * service serves itself at `appBaseUrl`.
 *
 * The endpoints read `localOrganisationsRepository`, which is never swapped, so
 * serving a request never calls back over HTTP. It reads from the primary, so
 * a read straight after a write sees it: the service reads from a secondary by
 * default, which could return the version from before the write.
 */
export const readAccreditationsOverHttpPlugin = {
  name: 'readAccreditationsOverHttp',
  version: '1.0.0',
  dependencies: ['mongodb', 'organisationsRepository'],

  register: async (
    /** @type {HapiServer} */ server,
    /** @type {{ config: import('convict').Config<Record<string, any>> }} */ {
      config
    }
  ) => {
    const hapiServer = /** @type {import('@hapi/hapi').Server} */ (
      /** @type {unknown} */ (server)
    )
    // Both decorated by the mongodb plugin this depends on
    const { mongoClient, db } =
      /** @type {{ mongoClient: MongoClient, db: Db }} */ (server)
    const primary = mongoClient.db(db.databaseName, {
      readPreference: 'primary'
    })
    const local = (
      await createOrganisationsRepository(
        primary,
        config.get('mongo.eventualConsistency')
      )
    )()
    const source = createHttpAccreditationsSource({
      baseUrl: config.get('appBaseUrl'),
      username: config.get('basicAuth.username'),
      password: config.get('basicAuth.password')
    })
    const decorated = withAccreditationsFrom(
      server.app.organisationsRepository,
      source
    )

    registerDependency(hapiServer, 'localOrganisationsRepository', () => local)
    registerDependency(hapiServer, 'organisationsRepository', () => decorated)
  }
}
