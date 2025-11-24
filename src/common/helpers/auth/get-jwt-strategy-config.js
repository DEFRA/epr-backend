import Boom from '@hapi/boom'
import { getEntraUserRoles } from './ge{}t-entra-user-roles.js'
import { getDefraIdUserRoles } from './get-defra-id-user-roles.js'
import { getUsersOrganisationInfo } from './get-users-org-info.js'
import { config } from '../../../config.js'

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
        // For Entra Id tokens, we only accept them if they were signed for Admin UI
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

      if (config.get('featureFlags.defraIdAuth')) {
        if (issuer === defraIdOidcConfig.issuer) {
          const frontendClientId = config.get('oidc.defraId.clientId')
          if (audience !== frontendClientId) {
            throw Boom.forbidden('Invalid audience for Defra Id token')
          }

          const { organisationsRepository } = request

          const { linkedEprOrg, organisationsInfo } = getUsersOrganisationInfo(
            tokenPayload,
            organisationsRepository
          )

          // The roles are determined by the currentRelationship, never by other relationships in the token
          const scope = getDefraIdUserRoles(linkedEprOrg, tokenPayload.email)

          return {
            isValid: scope.length > 0,
            credentials: {
              id: contactId,
              email,
              issuer,
              organisationsInfo,
              scope
            }
          }
        }
      }

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
