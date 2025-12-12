/**
 * Organisation Access Plugin
 *
 * Registers an onPostAuth extension that verifies users can only access
 * organisations they are linked to. This ensures proper 403 Forbidden
 * responses for authorisation failures (not 401 Unauthorized).
 *
 * Uses credentials.linkedOrgId set during JWT validation to check access.
 *
 * Also handles:
 * - Organisation status validation (ACTIVE/SUSPENDED only)
 * - Adding users to organisations on first access (addStandardUserIfNotPresent)
 */

import Boom from '@hapi/boom'
import { STATUS } from '#domain/organisations/model.js'
import { addStandardUserIfNotPresent } from '#common/helpers/auth/add-standard-user-if-not-present.js'

/**
 * @type {import('@hapi/hapi').Plugin<void>}
 */
export const orgAccessPlugin = {
  name: 'orgAccessPlugin',
  version: '2.0.0',

  /**
   * @param {import('@hapi/hapi').Server} server
   */
  register: async (server) => {
    server.ext('onPostAuth', async (request, h) => {
      const { organisationId } = request.params

      // Skip if not accessing an organisation resource
      if (!organisationId) {
        return h.continue
      }

      // Skip if not authenticated (let auth layer handle 401)
      if (!request.auth.isAuthenticated) {
        return h.continue
      }

      const { credentials } = request.auth
      const { linkedOrgId, tokenPayload } = credentials

      // If no linkedOrgId in credentials, this is likely an Entra ID token
      // (service maintainer) or a special flow - skip org access check
      if (!linkedOrgId) {
        return h.continue
      }

      // Check org mismatch
      if (organisationId !== linkedOrgId) {
        throw Boom.forbidden('Access denied: organisation mismatch')
      }

      // Check org status
      const organisationById =
        await request.organisationsRepository.findById(organisationId)
      const orgStatusIsAccessible = [STATUS.ACTIVE, STATUS.SUSPENDED].includes(
        organisationById.status
      )

      if (!orgStatusIsAccessible) {
        throw Boom.forbidden(
          'Access denied: organisation status not accessible'
        )
      }

      // Add user to organisation if not already present
      if (tokenPayload) {
        await addStandardUserIfNotPresent(
          request,
          tokenPayload,
          organisationById
        )
      }

      return h.continue
    })
  }
}
