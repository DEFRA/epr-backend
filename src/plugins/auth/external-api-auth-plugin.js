export const externalApiAuthPlugin = {
  plugin: {
    name: 'external-api-auth',
    version: '1.0.0',
    register: (server) => {
      server.auth.scheme('api-gateway-client-scheme', () => ({
        authenticate: (_request, h) => {
          // TODO(PAE-1058): Replace stub with Cognito client ID verification.
          // The CDP API gateway validates the JWT signature before requests
          // reach us. This stub should be replaced with logic that:
          // 1. Extracts the Bearer token from the Authorization header
          // 2. Decodes the JWT (no signature check needed)
          // 3. Validates client_id claim against config allow-list
          return h.authenticated({
            credentials: { id: 'rpd', name: 'RPD' }
          })
        }
      }))

      server.auth.strategy('api-gateway-client', 'api-gateway-client-scheme')
    }
  }
}
