import { portAdapter } from '#plugins/port-adapter.js'
import { createMongoExternalAccreditationsRepository } from './external-accreditations/mongodb.js'
import { createOrganisationReadRepository } from './repository/mongodb-and-reg-accred-api.js'
import { devExternalAccreditationPut } from './routes/external-accreditations/put.js'

/** @import { HapiServer } from '#common/hapi-types.js' */
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

/**
 * The MongoDB adapter for the external accreditations repository, which
 * stores the accreditations the read model serves where Reg Accred is not
 * called.
 */
export const externalAccreditationsRepositoryPlugin = portAdapter({
  provides: 'externalAccreditationsRepository',
  needs: ['mongodb'],

  build: (_options, { mongodb }) =>
    createMongoExternalAccreditationsRepository(mongodb)
})

/**
 * The read model's dev routes, which store external accreditations. Without
 * `devEndpoints` it adds no route.
 */
export const organisationReadModelDevRoutesPlugin = {
  name: 'organisation-read-model-dev-routes',

  /**
   * @param {HapiServer} server
   * @param {{ devEndpoints: boolean }} options
   */
  register: (server, { devEndpoints }) => {
    if (devEndpoints) {
      server.dependency([
        'organisationReadRepository',
        'externalAccreditationsRepository'
      ])
      server.route([devExternalAccreditationPut])
    }
  }
}
