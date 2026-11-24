import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './repository/mongodb-and-reg-accred-api.js'

/** @import { Server } from '@hapi/hapi' */
/** @import { Db } from 'mongodb' */
/** @import { ServerApp } from '#common/hapi-types.js' */
/** @import { RegAccredApiConfig } from './repository/reg-accred-accreditations.js' */

/**
 * The MongoDB adapter for the organisation read repository. It reads
 * exporters' sites through the overseas sites repository, so that plugin must
 * register first. With `featureFlags.regAccredExternalAccreditations` on, it
 * takes external accreditations from Reg Accred instead of the
 * `external-accreditations` collection.
 */
export const organisationReadRepositoryPlugin = {
  name: 'organisationReadRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'overseasSitesRepository'],

  /**
   * @param {Server} server
   * @param {{ config: { get: (key: string) => unknown } }} options
   */
  register: (server, { config }) => {
    const { overseasSitesRepository } = /** @type {Partial<ServerApp>} */ (
      server.app
    )
    if (!overseasSitesRepository) {
      throw new Error(
        'organisationReadRepository needs the overseasSitesRepository plugin registered before it'
      )
    }
    const createRepository = createOrganisationReadRepository(
      /** @type {Server & { db: Db }} */ (server).db,
      {
        regAccredApi: config.get('featureFlags.regAccredExternalAccreditations')
          ? /** @type {RegAccredApiConfig} */ (config.get('regAccredApi'))
          : undefined
      }
    )
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createRepository({ overseasSitesRepository, logger })
    )
  }
}
