/**
 * Organisation Access Test Plugin
 *
 * Test infrastructure that uses an in-memory auth context adapter for
 * controlled cross-organisation access testing with Hapi's auth injection.
 *
 * This plugin should ONLY be used in tests. Production uses org-access-plugin.js.
 */

import Boom from '@hapi/boom'

/** @typedef {import('#common/helpers/auth/auth-context-adapter.js').AuthContextAdapter} AuthContextAdapter */

/**
 * @type {import('@hapi/hapi').Plugin<{authContext: AuthContextAdapter}>}
 */
export const orgAccessTestPlugin = {
  name: 'orgAccessTestPlugin',
  version: '1.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   * @param {{authContext: AuthContextAdapter}} options
   */
  register: async (server, options) => {
    const { authContext } = options

    server.ext('onPostAuth', async (request, h) => {
      const { organisationId } = request.params

      // Skip if not accessing an organisation resource
      if (!organisationId) {
        return h.continue
      }

      const userId = request.auth.credentials.id
      // @ts-expect-error - userId type is set dynamically by auth injection in tests
      const access = await authContext.getUserOrgAccess(userId, organisationId)

      if (!access.linkedOrgId || access.linkedOrgId !== organisationId) {
        throw Boom.forbidden('Not linked to this organisation')
      }

      return h.continue
    })
  }
}
