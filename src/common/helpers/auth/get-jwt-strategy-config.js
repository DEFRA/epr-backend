import Boom from '@hapi/boom'
import { getEntraUserRoles } from './get-entra-user-roles.js'
import { config } from '../../../config.js'

export function getJwtStrategyConfig(oidcConfigs) {
  const { entraIdOidcConfig } = oidcConfigs

  return {
    keys: [
      {
        uri: entraIdOidcConfig.jwks_uri
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
    validate: async (artifacts) => {
      const tokenPayload = artifacts.decoded.payload
      const { iss: issuer, aud: audience, id: contactId, email } = tokenPayload

      console.log(
        '\n\n\n\n\n\n\n\n\n\n\n\n--------------------------------------------------- '
      )
      console.log('issuer', issuer)
      console.log('audience', audience)

      if (issuer === entraIdOidcConfig.issuer) {
        // Entra Id is not providing an audience in the token, so we need to supply it
        // This audience may not need to be a secret, only an env var
        const adminUiAsAudience = config.get('oidc.entraId.audience')
        if (audience !== adminUiAsAudience) {
          throw Boom.badRequest('Invalid audience for Entra ID token')
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

      // Defra id authentication goes here

      throw Boom.badRequest(`Unrecognized token issuer: ${issuer}`)
    }
  }
}
