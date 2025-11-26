import { config } from '#root/config.js'
import Boom from '@hapi/boom'
import { getEntraUserRoles } from './get-entra-user-roles.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'

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
      const { iss: issuer, aud: audience, id: contactId, email } = tokenPayload

      if (issuer === entraIdOidcConfig.issuer) {
        const adminUiEntraClientId = config.get('oidc.entraId.clientId')
        if (audience !== adminUiEntraClientId) {
          throw Boom.forbidden('Invalid audience for Entra ID token')
        }

        const scope = await getEntraUserRoles(tokenPayload)

        return {
          isValid: true,
          credentials: {
            id: contactId,
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
        const frontendClientId = config.get('oidc.defraId.clientId')
        if (audience !== frontendClientId) {
          throw Boom.forbidden('Invalid audience for Defra Id token')
        }

        // Placeholder for intercepting access to /organisations/user-info

        const isValidLinkingReq = await isAuthorisedOrgLinkingReq(
          request,
          tokenPayload
        )
        if (isValidLinkingReq) {
          return {
            isValid: true,
            credentials: {
              id: contactId,
              email,
              issuer,
              scope: []
            }
          }
        }

        // Place holder for validating access to any /{organisationId} endpoints
      }

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
