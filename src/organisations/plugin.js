import { devOrganisationsPutById } from './routes/dev-put-by-id.js'
import { organisationsGetById } from './routes/get-by-id.js'
import { organisationsPutById } from './routes/put-by-id.js'

/**
 * @typedef {object} OrganisationsRoutesOptions
 * @property {boolean} devEndpoints - whether to add the dev route that seeds
 *   an organisation
 */

export const organisationsRoutesPlugin = {
  name: 'organisations-routes',
  /**
   * @param {import('#common/hapi-types.js').HapiServer} server
   * @param {OrganisationsRoutesOptions} options
   */
  register: (server, { devEndpoints }) => {
    server.route([
      organisationsGetById,
      organisationsPutById,
      ...(devEndpoints ? [devOrganisationsPutById] : [])
    ])
  }
}
