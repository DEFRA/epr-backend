import { createMockOidcServers } from '#vite/helpers/mock-oidc-servers.js'
import { cognitoJwksUrl } from './mock-cognito-jwks.js'

export { cognitoJwksUrl }

export function setupAuthContext() {
  let mockOidcServer

  // Set up in beforeAll so it's available for createServer calls in beforeAll hooks
  beforeAll(() => {
    mockOidcServer = createMockOidcServers()
    mockOidcServer.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    mockOidcServer?.resetHandlers()
  })

  afterAll(() => {
    mockOidcServer?.close()
  })

  return {
    getServer: () => mockOidcServer
  }
}
