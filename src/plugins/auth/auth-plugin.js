import { getOidcConfigs } from '#common/helpers/auth/get-oidc-configs.js'
import { getJwtSchemeConfig } from '#common/helpers/auth/get-jwt-scheme-config.js'

export const authPlugin = {
  plugin: {
    name: 'auth',
    version: '1.0.0',
    register: async (server) => {
      const oidcConfigs = await getOidcConfigs()

      server.auth.strategy(
        'access-token',
        'jwt',
        getJwtSchemeConfig(oidcConfigs)
      )
      server.auth.default('access-token')
    }
  }
}
