import Hapi from '@hapi/hapi'
import Jwt from '@hapi/jwt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { externalApiAuthPlugin } from './external-api-auth-plugin.js'

const clientId = 'test-client-id'

function generateToken(payload) {
  return Jwt.token.generate(
    {
      sub: payload.client_id ?? clientId,
      token_use: 'access',
      scope: 'epr-backend-resource-srv/access',
      auth_time: 1734387454,
      iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_test',
      version: 2,
      jti: '00000000-0000-0000-0000-000000000000',
      ...payload
    },
    { key: 'unused', algorithm: 'HS256' }
  )
}

describe('external API auth plugin', () => {
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
  })

  afterAll(async () => {
    await server?.stop()
  })

  it('should authenticate with valid JWT and matching client_id', async () => {
    const token = generateToken({ client_id: clientId })

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
    const tokenWithoutClientId = Jwt.token.generate(
      {
        sub: 'some-sub',
        token_use: 'access',
        scope: 'epr-backend-resource-srv/access',
        auth_time: 1734387454,
        iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_test',
        version: 2,
        jti: '00000000-0000-0000-0000-000000000000'
      },
      { key: 'unused', algorithm: 'HS256' }
    )

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${tokenWithoutClientId}` }
    })

    expect(response.statusCode).toBe(401)
  })

  it('should return 403 when client_id does not match expected value', async () => {
    const token = generateToken({ client_id: 'wrong-client-id' })

    const response = await server.inject({
      method: 'GET',
      url: '/test',
      headers: { authorization: `Bearer ${token}` }
    })

    expect(response.statusCode).toBe(403)
  })
})
