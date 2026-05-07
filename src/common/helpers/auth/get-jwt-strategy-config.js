import { config } from '#root/config.js'
import Boom from '@hapi/boom'
import { ROLES } from './constants.js'
import { getDefraUserRoles } from './get-defra-user-roles.js'
import { getEntraUserRoles } from './get-entra-user-roles.js'

/**
 * Roles that retain access via the legacy `service_maintainer` Hapi scope
 * during the route re-scoping transition. Removed once every admin route
 * declares an explicit `admin.*` scope.
 */
const LEGACY_SERVICE_MAINTAINER_ROLES = new Set([
  'service_maintainer_write',
  'service_maintainer'
])

/** @typedef {import('./types.js').TokenPayload} TokenPayload */
/** @typedef {import('./types.js').EntraIdTokenPayload} EntraIdTokenPayload */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Configures JWT authentication strategy for both Entra ID and Defra ID
 * @param {Object} oidcConfigs - OIDC configuration for both identity providers
 * @param {Object} oidcConfigs.entraIdOidcConfig - Entra ID OIDC configuration
 * @param {Object} oidcConfigs.defraIdOidcConfig - Defra ID OIDC configuration
 * @returns {Object} JWT strategy configuration object
 */
export function getJwtStrategyConfig(oidcConfigs) {
  const { entraIdOidcConfig, defraIdOidcConfig } = oidcConfigs

  return {
    keys: [
      {
        uri: entraIdOidcConfig.jwks_uri
      },
      {
        uri: defraIdOidcConfig.jwks_uri
      }
    ],
    verify: {
      aud: false,
      iss: false,
      sub: false,
      nbf: true,
      exp: true,
      maxAgeSec: 3600, // 60 minutes
      timeSkewSec: 15
    },
    validate: async (artifacts, request) => {
      const tokenPayload = artifacts.decoded.payload
      const { iss: issuer, aud: audience } = tokenPayload

      if (issuer === entraIdOidcConfig.issuer) {
        // For Entra Id tokens, we only accept them if they were signed for Admin UI
        const adminUiEntraClientId = config.get('oidc.entraId.clientId')
        if (audience !== adminUiEntraClientId) {
          throw Boom.forbidden('Invalid audience for Entra ID token')
        }

        const email = tokenPayload.preferred_username

        const { role, scopes } = await getEntraUserRoles(email)
        const scope =
          role !== null && LEGACY_SERVICE_MAINTAINER_ROLES.has(role)
            ? [...scopes, ROLES.serviceMaintainer]
            : scopes

        return {
          isValid: true,
          credentials: {
            id: tokenPayload.oid,
            email,
            issuer,
            role,
            scope
          }
        }
      }

      if (issuer === defraIdOidcConfig.issuer) {
        const clientId = config.get('oidc.defraId.clientId')
        if (audience !== clientId) {
          throw Boom.forbidden('Invalid audience for Defra Id token')
        }

        const email = tokenPayload.email
        const name = [tokenPayload.firstName, tokenPayload.lastName]
          .filter(Boolean)
          .map((s) => s.trim())
          .join(' ')
        const scope = await getDefraUserRoles(tokenPayload, request)

        return {
          isValid: scope.length > 0,
          credentials: {
            id: tokenPayload.contactId,
            email,
            name,
            issuer,
            scope,
            currentRelationshipId: tokenPayload?.currentRelationshipId
          }
        }
      }

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
