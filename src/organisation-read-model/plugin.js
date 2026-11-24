import { dependsOn } from '#plugins/depends-on.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './repository/mongodb-and-reg-accred-api.js'

/** @import { Server } from '@hapi/hapi' */
/** @import { Db } from 'mongodb' */
/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { OrganisationReadRepository } from './index.js' */
/** @import { RegAccredApiConfig } from './repository/reg-accred-accreditations.js' */

/**
 * The read repository, or a factory that builds one from the capabilities it
 * reads.
 *
 * @typedef {OrganisationReadRepository | ((capabilities: {
 *   overseasSitesRepository: OverseasSitesRepository
 *   logger: TypedLogger
 * }) => OrganisationReadRepository)} OrganisationReadRepositoryAdapter
 */

/**
 * @param {{ get: (key: string) => unknown }} config
 * @param {Db} db
 */
const mongoAdapter = (config, db) =>
  createOrganisationReadRepository(db, {
    regAccredApi: config.get('featureFlags.regAccredExternalAccreditations')
      ? /** @type {RegAccredApiConfig} */ (config.get('regAccredApi'))
      : undefined
  })

/**
 * The organisation read model's Hapi plugin, which provides the read
 * repository. Given no adapter, it reads MongoDB, and with
 * `featureFlags.regAccredExternalAccreditations` on, it takes external
 * accreditations from Reg Accred instead of the `external-accreditations`
 * collection.
 */
export const organisationReadModel = {
  name: /** @type {const} */ ('organisation-read-model'),
  provides: /** @type {const} */ (['organisationReadRepository']),

  /**
   * @param {Server} server
   * @param {{
   *   config: { get: (key: string) => unknown }
   *   organisationReadRepository?: OrganisationReadRepositoryAdapter
   * }} options
   * @returns {void}
   */
  register: (server, { config, organisationReadRepository }) => {
    let provided = false
    dependsOn(
      server,
      organisationReadRepository
        ? ['overseasSitesRepository']
        : ['mongodb', 'overseasSitesRepository'],
      ({ overseasSitesRepository }) => {
        if (provided) {
          return
        }
        provided = true
        const adapter =
          organisationReadRepository ??
          mongoAdapter(config, /** @type {Server & { db: Db }} */ (server).db)
        registerDependency(
          server,
          'organisationReadRepository',
          ({ logger }) =>
            typeof adapter === 'function'
              ? adapter({ overseasSitesRepository, logger })
              : adapter
        )
      }
    )
  }
}
