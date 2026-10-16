import { mockOidcHandlers } from '#vite/helpers/mock-oidc-servers.js'
import { setupMsw } from '#vite/setup-msw.js'
import { cognitoJwksUrl } from './mock-cognito-jwks.js'

export { cognitoJwksUrl }

export function setupAuthContext() {
  const server = setupMsw(...mockOidcHandlers)

  return {
    getServer: () => server
  }
}
