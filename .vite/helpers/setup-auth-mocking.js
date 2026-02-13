import { createMockOidcServers } from '#vite/helpers/mock-oidc-servers.js'
import { cognitoJwksUrl } from './mock-cognito-jwks.js'

export { cognitoJwksUrl }

export function setupAuthContext(disabledMocks) {
  let mockOidcServer

  // Set up in beforeAll so it's available for createServer calls in beforeAll hooks
  beforeAll(() => {
    if (disabledMocks) {
      global.fetchMock?.disableMocks()
    }
    mockOidcServer = createMockOidcServers()
    mockOidcServer.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach(() => {
    mockOidcServer?.resetHandlers()
  })

  afterAll(() => {
    mockOidcServer?.close()
    if (disabledMocks) {
      global.fetchMock?.enableMocks()
    }
  })

  return {
    getServer: () => mockOidcServer
  }
}
