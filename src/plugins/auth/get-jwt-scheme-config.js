import Boom from '@hapi/boom'
import { getDefraUserRoles } from './get-defra-user-roles.js'
import { getEntraUserRoles } from './get-entra-user-roles.js'

export function getJwtSchemeConfig(oidcConfigs) {
  const { entraIdOidcConfig, defraIdOidcConfig } = oidcConfigs

  return {
    keys: [
      {
        uri: entraIdOidcConfig.jwksUri
      },
      {
        uri: defraIdOidcConfig.jwksUri
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
        if (audience !== entraIdOidcConfig.aud) {
          throw Boom.badRequest('Invalid audience for Entra ID token')
        }

        const scope = await getEntraUserRoles(tokenPayload, request)

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

      if (issuer === defraIdOidcConfig.issuer) {
        if (audience !== defraIdOidcConfig.aud) {
          throw Boom.badRequest('Invalid audience for Defra ID token')
        }

        const scope = await getDefraUserRoles(tokenPayload, request)

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

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
