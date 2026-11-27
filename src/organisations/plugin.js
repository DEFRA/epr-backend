import { devOrganisationsPutById } from './routes/dev-put-by-id.js'
import { organisationsGetById } from './routes/get-by-id.js'
import { organisationsPutById } from './routes/put-by-id.js'

/** @import { HapiServer } from '#common/hapi-types.js' */

/**
 * The organisations routes. With `devEndpoints`, it adds the dev route that
 * seeds an organisation.
 */
export const organisationsRoutesPlugin = {
  name: 'organisations-routes',
  dependencies: [
    'organisationsRepository',
    'overseasSitesRepository',
    'systemLogsRepository'
  ],

  /**
   * @param {HapiServer} server
   * @param {{ devEndpoints: boolean }} options
   */
  register: (server, { devEndpoints }) => {
    server.route([
      organisationsGetById,
      organisationsPutById,
      ...(devEndpoints ? [devOrganisationsPutById] : [])
    ])
  }
}
