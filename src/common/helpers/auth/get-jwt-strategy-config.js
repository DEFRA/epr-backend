import Boom from '@hapi/boom'
import { getEntraUserRoles } from './get-entra-user-roles.js'
import { getDefraIdUserRoles } from './get-defra-id-user-roles.js'
import { getUsersOrganisationInfo } from './get-users-org-info.js'
import { validateEprOrganisationAccess } from './validate-epr-org-access.js'
import { config } from '../../../config.js'
import { isAuthorisedOrgLinkingReq } from './authorise-org-linking.js'

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

      if (config.get('featureFlags.defraIdAuth')) {
        if (issuer === defraIdOidcConfig.issuer) {
          const frontendClientId = config.get('oidc.defraId.clientId')
          if (audience !== frontendClientId) {
            throw Boom.forbidden('Invalid audience for Defra Id token')
          }

          const { organisationsRepository } = request

          const { linkedEprOrg, userOrgs } = getUsersOrganisationInfo(
            tokenPayload,
            organisationsRepository
          )

          const isDiscoveryRequest =
            request.route.path === '/user-status' && request.method === 'get'
          if (isDiscoveryRequest) {
            // Any user can check the organisations associated with their token
            return {
              isValid: true,
              credentials: {
                id: contactId,
                email,
                issuer,
                userOrgs, // Useful for the discovery endpoint
                linkedEprOrg, // Could be useful in some endpoints
                scope: []
              }
            }
          }

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
                userOrgs, // Useful for the discovery endpoint
                linkedEprOrg, // Could be useful in some endpoints
                scope: []
              }
            }
          }

          // Throws an error if:
          // - the request does not have an organisationId param
          // - or if the linkedEprOrg does not match the organisationId param
          validateEprOrganisationAccess(request, linkedEprOrg)

          // The roles are determined by the currentRelationship, never by other relationships in the token
          const scope = getDefraIdUserRoles(linkedEprOrg, tokenPayload)

          return {
            isValid: scope.length > 0,
            credentials: {
              id: contactId,
              email,
              issuer,
              linkedEprOrg, // Could be useful in some endpoints
              scope
            }
          }
        }
      }

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
