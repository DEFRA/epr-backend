import Boom from '@hapi/boom'
import { extractAndDecodeTokenFromHeader } from './extract-and-decode-token-from-header.js'

export function eitherTokenAuthScheme(server, { candidateStrategies }) {
  return {
    async authenticate(request, h) {
      const decodedToken = extractAndDecodeTokenFromHeader(request)

      const { strategy } = candidateStrategies.find((candidate) =>
        candidate.test(decodedToken)
      )

      if (!strategy) {
        throw Boom.unauthorized('No valid authentication strategy found')
      }

      const { credentials, artifacts } = await server.auth.test(
        strategy,
        request
      )

      return h.authenticated({ credentials, artifacts })
    }
  }
}




{ candidateStrategies }) {

  entraOrDefraJwtOptions({
          defra: {
            audience: config.get('oidc.defraId.clientId'),
            jwksUri: defraIdWellKnownDetails.jwks_uri,
            issuer: defraIdWellKnownDetails.issuer
          },
          entra: {
            audience: config.get('oidc.azureAD.clientId'),
            jwksUri: entraWellKnownDetails.jwks_uri,
            issuer: entraWellKnownDetails.issuer
          }
        })
