import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationReadRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { RegAccredApiConfig } from './reg-accred-accreditations.js' */

/**
 * Reads exporters' sites through `server.app.overseasSitesRepository`, so it
 * must register before this plugin.
 *
 * With `featureFlags.regAccredExternalAccreditations` on, external
 * accreditations come from Reg Accred instead of the `external-accreditations`
 * collection.
 */
export const organisationReadRepositoryPlugin = {
  name: 'organisationReadRepository',
  version: '1.0.0',
  dependencies: ['mongodb', 'overseasSitesRepository'],

  /**
   * @param {import('@hapi/hapi').Server & { db: Db }} server
   * @param {{ config?: { get: (key: string) => unknown } }} [options]
   */
  register: (server, options = {}) => {
    const overseasSitesRepository = /** @type {OverseasSitesRepository} */ (
      server.app.overseasSitesRepository
    )
    const { config } = options
    const regAccredApi = config?.get(
      'featureFlags.regAccredExternalAccreditations'
    )
      ? /** @type {RegAccredApiConfig} */ (config.get('regAccredApi'))
      : undefined
    const createRepository = createOrganisationReadRepository(server.db, {
      regAccredApi
    })
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createRepository({ overseasSitesRepository, logger })
    )
  }
}
