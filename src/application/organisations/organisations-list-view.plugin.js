import { registerDependency } from '#plugins/register-dependency.js'
import { createOrganisationsListView } from './organisations-list-view.js'

/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { RequestAuth } from '#common/hapi-types.js'
 */

/**
 * Exposes `request.organisationsListView` so the organisations list route has
 * a reader that already knows what its caller may see. The route never names
 * the repository, so no unshaped organisation document is in reach of the
 * handler that serves the list.
 *
 * The cast below mirrors `prnEventsPlugin`: `registerDependency`'s
 * `getInstance` type only guarantees `{ logger }`, because it is also called
 * once at startup to build a `server.app` variant. That variant has no request
 * behind it and so no repository, and calling through it throws. Read the view
 * off the request, never off `server.app`.
 */
export const organisationsListViewPlugin = {
  name: 'organisationsListView',
  version: '1.0.0',
  dependencies: ['organisationsRepository'],

  /** @param {import('@hapi/hapi').Server} server */
  register: (server) => {
    registerDependency(server, 'organisationsListView', (request) => {
      const { organisationsRepository, auth } =
        /** @type {{ organisationsRepository: OrganisationsRepository, auth?: RequestAuth }} */ (
          /** @type {unknown} */ (request)
        )

      const credentials = auth?.credentials
      const scopes =
        credentials && 'scope' in credentials ? credentials.scope : []

      return createOrganisationsListView({ organisationsRepository, scopes })
    })
  }
}
