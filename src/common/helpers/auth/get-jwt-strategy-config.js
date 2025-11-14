import Boom from '@hapi/boom'
import { getDefraIdUserRoles } from './get-defra-id-user-roles.js'
import { getEntraUserRoles } from './get-entra-user-roles.js'
import { config } from '../../../config.js'

export function getJwtStrategyConfig(oidcConfigs) {
  const { defraIdOidcConfig, entraIdOidcConfig } = oidcConfigs

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
    validate: async (artifacts, request, h) => {
      const tokenPayload = artifacts.decoded.payload
      const { iss: issuer, aud: audience, id: contactId, email } = tokenPayload

      if (issuer === entraIdOidcConfig.issuer) {
        // For Entra ID tokens, we only accept them if they were signed for Admin UI
        const clientId = config.get('oidc.entraId.clientId')
        if (audience !== clientId) {
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

      if (issuer === defraIdOidcConfig.issuer) {
        // For Defra ID tokens, we only accept them if they were signed for Admin UI
        // const clientId = config.get('oidc.defraId.wellKnownUrl')
        //
        // if (audience !== clientId) {
        //   throw Boom.forbidden('Invalid audience for Defra ID token')
        // }

        const { response, scope } = await getDefraIdUserRoles(
          tokenPayload,
          request,
          h
        )

        const isValid = !!scope?.length

        const credentials = isValid
          ? {
              id: contactId,
              email,
              issuer,
              scope
            }
          : undefined

        return response
          ? {
              response
            }
          : {
              isValid,
              credentials
            }
      }

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
