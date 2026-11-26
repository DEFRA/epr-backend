import { portAdapter } from '#plugins/port-adapter.js'
import { createOrganisationReadRepository } from './repository/mongodb-and-reg-accred-api.js'

/** @import { RegAccredApiConfig } from '#common/helpers/reg-accred-api.js' */

/**
 * The MongoDB adapter for the organisation read repository. Given
 * `regAccredApi`, it takes external accreditations from Reg Accred instead of
 * the `external-accreditations` collection.
 */
export const organisationReadRepositoryPlugin = portAdapter({
  provides: 'organisationReadRepository',
  needs: ['mongodb', 'overseasSitesRepository'],

  /** @param {{ regAccredApi?: RegAccredApiConfig }} options */
  build: ({ regAccredApi }, { mongodb, overseasSitesRepository }) => {
    const createRepository = createOrganisationReadRepository(mongodb, {
      regAccredApi
    })
    return ({ logger }) => createRepository({ overseasSitesRepository, logger })
  }
})
