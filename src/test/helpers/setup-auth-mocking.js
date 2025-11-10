import { createMockOidcServers } from '#test/helpers/mock-oidc.js'

export function setupAuthContext() {
  beforeEach((context) => {
    global.fetchMock?.disableMocks()
    context.mockOidcServer = createMockOidcServers()
    context.mockOidcServer.listen({ onUnhandledRequest: 'warn' })
  })

  afterEach((context) => {
    context.mockOidcServer?.resetHandlers()
    context.mockOidcServer?.close()
    global.fetchMock?.enableMocks()
  })
}
