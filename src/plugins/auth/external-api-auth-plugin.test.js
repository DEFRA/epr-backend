import {
  generateExternalApiToken,
  generateExternalApiTokenWithoutClientId
} from '#packaging-recycling-notes/routes/test-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { externalApiAuthPlugin } from './external-api-auth-plugin.js'

const clientId = 'test-client-id'

describe('external API auth plugin', () => {
  setupAuthContext(true)

  let server

  beforeAll(async () => {
    server = Hapi.server({ port: 0 })
    await server.register(Jwt)
    await server.register({
      plugin: externalApiAuthPlugin.plugin,
      options: { clientId }
    })

    server.route({
      method: 'GET',
      path: '/test',
      options: { auth: { strategy: 'api-gateway-client' } },
      handler: (request) => request.auth.credentials
    })

    await server.initialize()
  })

  afterAll(async () => {
    await server?.stop()
  })

  it('should authenticate with valid JWT and matching client_id', async () => {
    const token = generateExternalApiToken(clientId)

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(200)
    expect(response.result).toEqual({
      id: clientId,
      isMachine: true,
      name: 'RPD'
    })
  })

  it('should return 401 when authorization header is missing', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test'
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 401 for non-Bearer authorization scheme', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Basic dXNlcjpwYXNz' }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 401 for malformed JWT', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: 'Bearer not-a-valid-jwt' }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 401 when client_id claim is missing', async () => {
    const tokenWithoutClientId = generateExternalApiTokenWithoutClientId()

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${tokenWithoutClientId}` }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 401 when token_use is not access', async () => {
    const token = generateExternalApiToken(clientId, { token_use: 'id' })

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 401 when token is expired', async () => {
    const token = generateExternalApiToken(clientId, {
      exp: Math.floor(Date.now() / 1000) - 60
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 403 when client_id does not match expected value', async () => {
    const token = generateExternalApiToken('wrong-client-id')

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(403)
  })
})
