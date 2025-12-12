/**
 * Organisation Access Plugin - Tier 2 testing infrastructure
 *
 * Registers an onPostAuth extension that verifies users can only access
 * organisations they are linked to. Uses the Auth Context Adapter pattern
 * to decouple org access checking from JWT validation.
 *
 * This plugin is optional and only registered when an authContext is provided.
 * In production, org access is still checked during JWT validation.
 * For Tier 2 tests, this plugin provides a second layer of checking that
 * works with Hapi's auth injection.
 *
 * See ADR 0007 (docs/testing/0007-auth-context-adapter-for-testing.md) for details.
 */

import Boom from '@hapi/boom'

/** @typedef {import('#common/helpers/auth/auth-context-adapter.js').AuthContextAdapter} AuthContextAdapter */

/**
 * @type {import('@hapi/hapi').Plugin<{authContext: AuthContextAdapter}>}
 */
export const orgAccessPlugin = {
  name: 'orgAccessPlugin',
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

      const { id: userId } = request.auth.credentials

      const access = await authContext.getUserOrgAccess(userId, organisationId)

      if (!access.linkedOrgId || access.linkedOrgId !== organisationId) {
        throw Boom.forbidden('Not linked to this organisation')
      }

      return h.continue
    })
  }
}
