import tls from 'node:tls'
import Hapi from '@hapi/hapi'
import { secureContext } from '@defra/hapi-secure-context'

describe('setup-tls', () => {
  const originalCreateSecureContext = tls.createSecureContext

  it('should let a server registering secureContext patch tls.createSecureContext', async () => {
    const server = Hapi.server()
    await server.register(secureContext)

    expect(tls.createSecureContext).not.toBe(originalCreateSecureContext)
  })

  it('should restore the original tls.createSecureContext before the next test', () => {
    expect(tls.createSecureContext).toBe(originalCreateSecureContext)
  })
})
