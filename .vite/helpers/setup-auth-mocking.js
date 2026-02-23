import { createMockOidcServers } from '#vite/helpers/mock-oidc-servers.js'
import { cognitoJwksUrl } from './mock-cognito-jwks.js'

export { cognitoJwksUrl }

export function setupAuthContext() {
  let mockOidcServer

  // Set up in beforeAll so it's available for createServer calls in beforeAll hooks
  beforeAll(() => {
    global.fetchMock?.disableMocks()
    mockOidcServer = createMockOidcServers()
    mockOidcServer.listen({ onUnhandledRequest: 'error' })
  })

  afterEach(() => {
    mockOidcServer?.resetHandlers()
  })

  afterAll(() => {
    mockOidcServer?.close()
    global.fetchMock?.enableMocks()
  })

  return {
    getServer: () => mockOidcServer
  }
}
