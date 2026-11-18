import { registerDependency } from '#plugins/register-dependency.js'
import { regAccredRegistrationService } from '../registration-service/reg-accred.js'
import { standInRegistrationService } from '../registration-service/stand-in/mongodb.js'
import { createOrganisationReadRepository } from './mongodb.js'

/** @import { Db } from 'mongodb' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { RegAccredApiConfig } from '../registration-service/reg-accred.js' */

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
    const registrationService = config?.get(
      'featureFlags.regAccredExternalAccreditations'
    )
      ? regAccredRegistrationService(
          /** @type {RegAccredApiConfig} */ (config.get('regAccredApi'))
        )
      : standInRegistrationService(server.db)
    const createRepository = createOrganisationReadRepository(
      server.db,
      registrationService
    )
    registerDependency(server, 'organisationReadRepository', ({ logger }) =>
      createRepository({ overseasSitesRepository, logger })
    )
  }
}
