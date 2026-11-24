import { dependsOn } from '#plugins/depends-on.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './repository/mongodb-and-reg-accred-api.js'

/** @import { Server } from '@hapi/hapi' */
/** @import { Db } from 'mongodb' */
/** @import { RegAccredApiConfig } from './repository/reg-accred-accreditations.js' */

/**
 * The MongoDB adapter for the organisation read repository. With
 * `featureFlags.regAccredExternalAccreditations` on, it takes external
 * accreditations from Reg Accred instead of the `external-accreditations`
 * collection.
 */
export const organisationReadRepositoryPlugin = {
  name: /** @type {const} */ ('organisationReadRepository'),

  /**
   * @param {Server} server
   * @param {{ config: { get: (key: string) => unknown } }} options
   * @returns {void}
   */
  register: (server, { config }) => {
    dependsOn(
      server,
      ['mongodb', 'overseasSitesRepository'],
      ({ overseasSitesRepository }) => {
        const createRepository = createOrganisationReadRepository(
          /** @type {Server & { db: Db }} */ (server).db,
          {
            regAccredApi: config.get(
              'featureFlags.regAccredExternalAccreditations'
            )
              ? /** @type {RegAccredApiConfig} */ (config.get('regAccredApi'))
              : undefined
          }
        )
        registerDependency(server, 'organisationReadRepository', ({ logger }) =>
          createRepository({ overseasSitesRepository, logger })
        )
      }
    )
  }
}
