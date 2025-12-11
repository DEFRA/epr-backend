import { config } from '#root/config.js'
import Boom from '@hapi/boom'
import { getDefraUserRoles } from './get-defra-user-roles.js'
import { getEntraUserRoles } from './get-entra-user-roles.js'

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

        const email = tokenPayload.email || tokenPayload.preferred_username

        const scope = await getEntraUserRoles(email)

        return {
          isValid: true,
          credentials: {
            id: tokenPayload.oid,
            email,
            issuer,
            scope
          }
        }
      }

      if (
        config.get('featureFlags.defraIdAuth') &&
        issuer === defraIdOidcConfig.issuer
      ) {
        const clientId = config.get('oidc.defraId.clientId')
        if (audience !== clientId) {
          throw Boom.forbidden('Invalid audience for Defra Id token')
        }

        const email = tokenPayload.email
        const scope = await getDefraUserRoles(tokenPayload, request)

        return {
          isValid: scope.length > 0,
          credentials: {
            id: tokenPayload.contactId,
            email,
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
