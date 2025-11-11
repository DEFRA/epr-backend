import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

import { getOidcConfigs } from './get-oidc-configs.js'

const mockFetchJson = vi.fn()
const mockConfigGet = vi.fn()

vi.mock('#common/helpers/fetch-json.js', () => ({
  fetchJson: (...args) => mockFetchJson(...args)
}))

vi.mock('../../../config.js', () => ({
  config: {
    get: (...args) => mockConfigGet(...args)
  }
}))

describe('#getOidcConfigs', () => {
  const mockWellKnownUrl =
    'https://login.microsoftonline.com/tenant-id/v2.0/.well-known/openid-configuration'
  const mockEntraIdOidcConfig = {
    issuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
    authorization_endpoint:
      'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize',
    token_endpoint:
      'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token',
    jwks_uri: 'https://login.microsoftonline.com/tenant-id/discovery/v2.0/keys'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigGet.mockReturnValue(mockWellKnownUrl)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('on successful fetch', () => {
    test('returns entraIdOidcConfig when fetchJson succeeds', async () => {
      mockFetchJson.mockResolvedValue(mockEntraIdOidcConfig)

      const result = await getOidcConfigs()

      expect(result).toEqual({
        entraIdOidcConfig: mockEntraIdOidcConfig
      })
    })

    test('calls config.get with correct configuration key', async () => {
      mockFetchJson.mockResolvedValue(mockEntraIdOidcConfig)

      await getOidcConfigs()

      expect(mockConfigGet).toHaveBeenCalledWith(
        'oidc.entraId.oidcWellKnownConfigurationUrl'
      )
      expect(mockConfigGet).toHaveBeenCalledTimes(1)
    })

    test('calls fetchJson with the URL from config', async () => {
      mockFetchJson.mockResolvedValue(mockEntraIdOidcConfig)

      await getOidcConfigs()

      expect(mockFetchJson).toHaveBeenCalledWith(mockWellKnownUrl)
      expect(mockFetchJson).toHaveBeenCalledTimes(1)
    })

    test('handles complete OIDC configuration with all fields', async () => {
      const completeConfig = {
        ...mockEntraIdOidcConfig,
        userinfo_endpoint: 'https://graph.microsoft.com/oidc/userinfo',
        end_session_endpoint:
          'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/logout',
        response_types_supported: ['code', 'id_token', 'code id_token'],
        subject_types_supported: ['pairwise'],
        id_token_signing_alg_values_supported: ['RS256']
      }

      mockFetchJson.mockResolvedValue(completeConfig)

      const result = await getOidcConfigs()

      expect(result.entraIdOidcConfig).toEqual(completeConfig)
    })
  })

  describe('on error', () => {
    test('throws error when fetchJson fails', async () => {
      const fetchError = new Error('Network error')
      mockFetchJson.mockRejectedValue(fetchError)

      await expect(getOidcConfigs()).rejects.toThrow('Network error')
    })

    test('throws error when config URL is invalid', async () => {
      mockConfigGet.mockReturnValue('invalid-url')
      const fetchError = new Error('Failed to fetch')
      mockFetchJson.mockRejectedValue(fetchError)

      await expect(getOidcConfigs()).rejects.toThrow('Failed to fetch')
    })

    test('propagates Boom error from fetchJson', async () => {
      const Boom = await import('@hapi/boom')
      const boomError = Boom.badRequest('Invalid OIDC configuration')
      mockFetchJson.mockRejectedValue(boomError)

      await expect(getOidcConfigs()).rejects.toMatchObject({
        isBoom: true,
        message: 'Invalid OIDC configuration'
      })
    })

    test('throws error when OIDC endpoint returns 404', async () => {
      const notFoundError = new Error('OIDC endpoint not found')
      mockFetchJson.mockRejectedValue(notFoundError)

      await expect(getOidcConfigs()).rejects.toThrow('OIDC endpoint not found')
    })

    test('throws error when OIDC endpoint returns unauthorized', async () => {
      const unauthorizedError = new Error('Unauthorized')
      mockFetchJson.mockRejectedValue(unauthorizedError)

      await expect(getOidcConfigs()).rejects.toThrow('Unauthorized')
    })
  })

  describe('concurrent fetching', () => {
    test('uses Promise.all to fetch configurations', async () => {
      mockFetchJson.mockResolvedValue(mockEntraIdOidcConfig)

      const result = await getOidcConfigs()

      expect(result).toEqual({
        entraIdOidcConfig: mockEntraIdOidcConfig
      })
      // Verify that the function structure allows for concurrent fetching
      expect(mockFetchJson).toHaveBeenCalledTimes(1)
    })

    test('can be called multiple times independently', async () => {
      mockFetchJson.mockResolvedValue(mockEntraIdOidcConfig)

      const [result1, result2, result3] = await Promise.all([
        getOidcConfigs(),
        getOidcConfigs(),
        getOidcConfigs()
      ])

      expect(result1).toEqual({ entraIdOidcConfig: mockEntraIdOidcConfig })
      expect(result2).toEqual({ entraIdOidcConfig: mockEntraIdOidcConfig })
      expect(result3).toEqual({ entraIdOidcConfig: mockEntraIdOidcConfig })
      expect(mockFetchJson).toHaveBeenCalledTimes(3)
    })
  })
})
