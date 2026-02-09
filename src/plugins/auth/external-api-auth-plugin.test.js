import Hapi from '@hapi/hapi'
import { describe, it, expect, afterAll } from 'vitest'

import { externalApiAuthPlugin } from './external-api-auth-plugin.js'

describe('external API auth plugin', () => {
  let server

  afterAll(async () => {
    await server?.stop()
  })

  it('registers api-gateway-client auth strategy', async () => {
    server = Hapi.server({ port: 0 })
    await server.register(externalApiAuthPlugin)

    server.route({
      method: 'GET',
      path: '/test',
      options: { auth: { strategy: 'api-gateway-client' } },
      handler: () => 'ok'
    })

    const response = await server.inject({ method: 'GET', url: '/test' })

    expect(response.statusCode).toBe(200)
  })

  it('provides RPD credentials on authenticated requests', async () => {
    server = Hapi.server({ port: 0 })
    await server.register(externalApiAuthPlugin)

    server.route({
      method: 'GET',
      path: '/test',
      options: { auth: { strategy: 'api-gateway-client' } },
      handler: (request) => request.auth.credentials
    })

    const response = await server.inject({ method: 'GET', url: '/test' })

    expect(response.result).toEqual({ id: 'rpd', name: 'RPD' })
  })
})
