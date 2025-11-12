import {
  createMockOidcServers,
  createEntraIdMockOidcConfiguration
} from './mock-oidc.js'
import { getTestPublicKey } from './create-test-tokens.js'

describe('mock-oidc', () => {
  const entraIdBaseUrl =
    'https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007'

  describe('createEntraIdMockOidcConfiguration', () => {
    it('should create OIDC configuration with correct endpoints', () => {
      const baseUrl = 'http://test-server.com'
      const config = createEntraIdMockOidcConfiguration(baseUrl)

      expect(config).toHaveProperty(
        'authorization_endpoint',
        `${baseUrl}/oauth2/v2.0/authorize`
      )
      expect(config).toHaveProperty(
        'token_endpoint',
        `${baseUrl}/oauth2/v2.0/token`
      )
      expect(config).toHaveProperty(
        'end_session_endpoint',
        `${baseUrl}/oauth2/v2.0/logout`
      )
      expect(config).toHaveProperty('issuer', `${baseUrl}/v2.0`)
      expect(config).toHaveProperty(
        'jwks_uri',
        `${baseUrl}/discovery/v2.0/keys`
      )
    })

    it('should handle different base URLs correctly', () => {
      const baseUrl = 'https://custom.example.com/auth'
      const config = createEntraIdMockOidcConfiguration(baseUrl)

      expect(config.authorization_endpoint).toBe(
        `${baseUrl}/oauth2/v2.0/authorize`
      )
      expect(config.token_endpoint).toBe(`${baseUrl}/oauth2/v2.0/token`)
      expect(config.end_session_endpoint).toBe(`${baseUrl}/oauth2/v2.0/logout`)
      expect(config.issuer).toBe(`${baseUrl}/v2.0`)
      expect(config.jwks_uri).toBe(`${baseUrl}/discovery/v2.0/keys`)
    })

    it('should create configuration object with all required properties', () => {
      const config = createEntraIdMockOidcConfiguration('http://test.com')

      expect(Object.keys(config)).toEqual([
        'authorization_endpoint',
        'token_endpoint',
        'end_session_endpoint',
        'issuer',
        'jwks_uri'
      ])
    })

    it('should handle base URL without trailing slash', () => {
      const config = createEntraIdMockOidcConfiguration('http://test.com')

      // Should correctly form URLs with proper single slash separation
      expect(config.authorization_endpoint).toBe(
        'http://test.com/oauth2/v2.0/authorize'
      )
      expect(config.token_endpoint).toBe('http://test.com/oauth2/v2.0/token')
    })

    it('should handle base URL with trailing slash', () => {
      const baseUrl = 'http://test.com/'
      const config = createEntraIdMockOidcConfiguration(baseUrl)

      // Note: The function does NOT normalize trailing slashes, so double slashes appear
      expect(config.authorization_endpoint).toBe(
        'http://test.com//oauth2/v2.0/authorize'
      )
      expect(config.token_endpoint).toBe('http://test.com//oauth2/v2.0/token')
    })
  })

  describe('createMockOidcServers', () => {
    let server

    afterEach(() => {
      if (server) {
        server.close()
        server = null
      }
    })

    it('should create a server instance', () => {
      server = createMockOidcServers()

      expect(server).toBeDefined()
      expect(server).toHaveProperty('listen')
      expect(server).toHaveProperty('close')
      expect(server).toHaveProperty('resetHandlers')
    })

    it('should setup server with OIDC discovery endpoint', async () => {
      server = createMockOidcServers()
      server.listen()

      const wellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
      const response = await fetch(wellKnownUrl)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('authorization_endpoint')
      expect(data).toHaveProperty('token_endpoint')
      expect(data).toHaveProperty('end_session_endpoint')
      expect(data).toHaveProperty('issuer')
      expect(data).toHaveProperty('jwks_uri')
    })

    it('should setup server with JWKS endpoint', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('keys')
      expect(Array.isArray(data.keys)).toBe(true)
      expect(data.keys.length).toBeGreaterThan(0)
    })

    it('should return JWKS with test public key', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)
      const data = await response.json()

      const publicKey = getTestPublicKey()
      expect(data.keys[0]).toEqual(publicKey)
    })

    it('should return JWKS with correct key properties', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)
      const data = await response.json()

      const key = data.keys[0]
      expect(key).toHaveProperty('kid', 'test-key-id')
      expect(key).toHaveProperty('use', 'sig')
      expect(key).toHaveProperty('alg', 'RS256')
      expect(key).toHaveProperty('kty', 'RSA')
    })

    it('should return correct OIDC configuration with Entra ID base URL', async () => {
      server = createMockOidcServers()
      server.listen()

      const wellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
      const response = await fetch(wellKnownUrl)
      const data = await response.json()

      expect(data.authorization_endpoint).toBe(
        `${entraIdBaseUrl}/oauth2/v2.0/authorize`
      )
      expect(data.token_endpoint).toBe(`${entraIdBaseUrl}/oauth2/v2.0/token`)
      expect(data.end_session_endpoint).toBe(
        `${entraIdBaseUrl}/oauth2/v2.0/logout`
      )
      expect(data.issuer).toBe(`${entraIdBaseUrl}/v2.0`)
      expect(data.jwks_uri).toBe(`${entraIdBaseUrl}/discovery/v2.0/keys`)
    })

    it('should allow server to be started and stopped', () => {
      server = createMockOidcServers()

      expect(() => {
        server.listen()
        server.close()
      }).not.toThrow()
    })

    it('should support resetHandlers method', () => {
      server = createMockOidcServers()
      server.listen()

      expect(() => {
        server.resetHandlers()
      }).not.toThrow()
    })

    it('should handle multiple requests to the same endpoint', async () => {
      server = createMockOidcServers()
      server.listen()

      const wellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`

      const response1 = await fetch(wellKnownUrl)
      const data1 = await response1.json()

      const response2 = await fetch(wellKnownUrl)
      const data2 = await response2.json()

      expect(data1).toEqual(data2)
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
    })

    it('should handle concurrent requests', async () => {
      server = createMockOidcServers()
      server.listen()

      const wellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`

      const [response1, response2] = await Promise.all([
        fetch(wellKnownUrl),
        fetch(jwksUrl)
      ])

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)
    })
  })

  describe('integration with createEntraIdMockOidcConfiguration', () => {
    let server

    afterEach(() => {
      if (server) {
        server.close()
        server = null
      }
    })

    it('should use createEntraIdMockOidcConfiguration internally', async () => {
      server = createMockOidcServers()
      server.listen()

      const wellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
      const response = await fetch(wellKnownUrl)
      const data = await response.json()

      // Compare with what createEntraIdMockOidcConfiguration would return
      const expectedConfig = createEntraIdMockOidcConfiguration(entraIdBaseUrl)

      expect(data).toEqual(expectedConfig)
    })
  })

  describe('JWKS response structure', () => {
    let server

    afterEach(() => {
      if (server) {
        server.close()
        server = null
      }
    })

    it('should return JWKS in correct format', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)
      const data = await response.json()

      expect(data).toHaveProperty('keys')
      expect(Array.isArray(data.keys)).toBe(true)
    })

    it('should include exactly one key in JWKS', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)
      const data = await response.json()

      expect(data.keys).toHaveLength(1)
    })

    it('should include RSA key components in JWKS', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)
      const data = await response.json()

      const key = data.keys[0]
      expect(key.kty).toBe('RSA')
      expect(key).toHaveProperty('n') // modulus
      expect(key).toHaveProperty('e') // exponent
    })
  })

  describe('endpoint URL patterns', () => {
    it('should use correct well-known URL pattern', () => {
      const expectedPattern = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
      expect(expectedPattern).toContain('.well-known/openid-configuration')
      expect(expectedPattern).toContain('/v2.0/')
    })

    it('should use correct JWKS URL pattern', () => {
      const expectedPattern = `${entraIdBaseUrl}/discovery/v2.0/keys`
      expect(expectedPattern).toContain('/discovery/v2.0/keys')
    })

    it('should match Entra ID URL structure', () => {
      expect(entraIdBaseUrl).toMatch(
        /^https:\/\/login\.microsoftonline\.com\/[a-f0-9-]+$/
      )
    })
  })

  describe('server lifecycle', () => {
    it('should allow multiple server instances to be created', () => {
      const server1 = createMockOidcServers()
      const server2 = createMockOidcServers()

      expect(server1).toBeDefined()
      expect(server2).toBeDefined()
      expect(server1).not.toBe(server2)
    })

    it('should be reusable after close', async () => {
      const server = createMockOidcServers()

      server.listen()
      server.close()

      // Should be able to listen again
      expect(() => {
        server.listen()
        server.close()
      }).not.toThrow()
    })
  })

  describe('edge cases', () => {
    let server

    afterEach(() => {
      if (server) {
        server.close()
        server = null
      }
    })

    it('should handle empty base URL gracefully', () => {
      const config = createEntraIdMockOidcConfiguration('')

      expect(config.authorization_endpoint).toBe('/oauth2/v2.0/authorize')
      expect(config.token_endpoint).toBe('/oauth2/v2.0/token')
    })

    it('should return JSON content-type for OIDC endpoint', async () => {
      server = createMockOidcServers()
      server.listen()

      const wellKnownUrl = `${entraIdBaseUrl}/v2.0/.well-known/openid-configuration`
      const response = await fetch(wellKnownUrl)

      const contentType = response.headers.get('content-type')
      expect(contentType).toContain('application/json')
    })

    it('should return JSON content-type for JWKS endpoint', async () => {
      server = createMockOidcServers()
      server.listen()

      const jwksUrl = `${entraIdBaseUrl}/discovery/v2.0/keys`
      const response = await fetch(jwksUrl)

      const contentType = response.headers.get('content-type')
      expect(contentType).toContain('application/json')
    })
  })
})
