import { getOidcConfigs } from '#common/helpers/auth/get-oidc-configs.js'
import { eitherTokenAuthScheme } from './either-token-auth-scheme.js'
import { extractJwtOptions } from './extract-jwt-options.js'

export const auth = {
  plugin: {
    name: 'auth',
    version: '1.0.0',
    register: async (server) => {
      const { entraIdOidcConfig, defraIdOidcConfig } = await getOidcConfigs()

      server.auth.strategy(
        'entra-id-access-token',
        'jwt',
        extractJwtOptions(entraIdOidcConfig)
      )

      server.auth.strategy(
        'defra-id-access-token',
        'jwt',
        extractJwtOptions(defraIdOidcConfig)
      )

      server.auth.scheme('either-token', eitherTokenAuthScheme)

      server.auth.strategy('access-token', 'either-token', {
        candidateStrategies: [
          {
            strategy: 'defra-id-access-token',
            test(token) {
              return token.iss === defraIdOidcConfig.issuer
            }
          },
          {
            strategy: 'entra-id-access-token',
            test(token) {
              return token.iss === entraIdOidcConfig.issuer
            }
          }
        ]
      })

      // The most restrictive strategy is the default one
      server.auth.default('entra-id-access-token')
    }
  }
}
