import { vi, describe, test, expect, beforeEach } from 'vitest'

import { authPlugin } from './auth-plugin.js'

// Mock the auth helpers
const mockGetOidcConfigs = vi.fn()
const mockGetJwtStrategyConfig = vi.fn()

vi.mock('#common/helpers/auth/get-oidc-configs.js', () => ({
  getOidcConfigs: (...args) => mockGetOidcConfigs(...args)
}))

vi.mock('#common/helpers/auth/get-jwt-strategy-config.js', () => ({
  getJwtStrategyConfig: (...args) => mockGetJwtStrategyConfig(...args)
}))

describe('authPlugin', () => {
  let mockServer

  beforeEach(() => {
    vi.clearAllMocks()

    mockServer = {
      auth: {
        strategy: vi.fn(),
        default: vi.fn()
      }
    }

    const mockOidcConfigs = {
      entraIdOidcConfig: {
        issuer: 'https://login.microsoftonline.com/test/v2.0',
        jwks_uri: 'https://login.microsoftonline.com/test/keys'
      },
      defraIdOidcConfig: {
        issuer: 'https://defra-id.example.com',
        jwks_uri: 'https://defra-id.example.com/jwks'
      }
    }

    const mockStrategyConfig = {
      keys: [
        { uri: 'https://login.microsoftonline.com/test/keys' },
        { uri: 'https://defra-id.example.com/jwks' }
      ],
      verify: {
        aud: false,
        iss: false,
        sub: false,
        nbf: true,
        exp: true,
        maxAgeSec: 3600,
        timeSkewSec: 15
      },
      validate: vi.fn()
    }

    mockGetOidcConfigs.mockResolvedValue(mockOidcConfigs)
    mockGetJwtStrategyConfig.mockReturnValue(mockStrategyConfig)
  })

  describe('plugin metadata', () => {
    test('has correct plugin name', () => {
      expect(authPlugin.plugin.name).toBe('auth')
    })

    test('has correct plugin version', () => {
      expect(authPlugin.plugin.version).toBe('1.0.0')
    })

    test('has register function', () => {
      expect(authPlugin.plugin.register).toBeTypeOf('function')
    })
  })

  describe('plugin registration', () => {
    test('fetches OIDC configurations on registration', async () => {
      await authPlugin.plugin.register(mockServer)

      expect(mockGetOidcConfigs).toHaveBeenCalledTimes(1)
    })

    test('creates JWT strategy config with OIDC configs', async () => {
      const mockOidcConfigs = {
        entraIdOidcConfig: {
          issuer: 'https://entra.example.com',
          jwks_uri: 'https://entra.example.com/jwks'
        },
        defraIdOidcConfig: {
          issuer: 'https://defra.example.com',
          jwks_uri: 'https://defra.example.com/jwks'
        }
      }
      mockGetOidcConfigs.mockResolvedValue(mockOidcConfigs)

      await authPlugin.plugin.register(mockServer)

      expect(mockGetJwtStrategyConfig).toHaveBeenCalledWith(mockOidcConfigs)
      expect(mockGetJwtStrategyConfig).toHaveBeenCalledTimes(1)
    })

    test('registers access-token auth strategy', async () => {
      const mockStrategyConfig = {
        keys: [{ uri: 'https://example.com/jwks' }],
        verify: { exp: true },
        validate: vi.fn()
      }
      mockGetJwtStrategyConfig.mockReturnValue(mockStrategyConfig)

      await authPlugin.plugin.register(mockServer)

      expect(mockServer.auth.strategy).toHaveBeenCalledWith(
        'access-token',
        'jwt',
        mockStrategyConfig
      )
      expect(mockServer.auth.strategy).toHaveBeenCalledTimes(1)
    })

    test('sets access-token as default auth strategy', async () => {
      await authPlugin.plugin.register(mockServer)

      expect(mockServer.auth.default).toHaveBeenCalledWith('access-token')
      expect(mockServer.auth.default).toHaveBeenCalledTimes(1)
    })

    test('sets default auth after registering strategy', async () => {
      const callOrder = []

      mockServer.auth.strategy = vi.fn(() => {
        callOrder.push('strategy')
      })
      mockServer.auth.default = vi.fn(() => {
        callOrder.push('default')
      })

      await authPlugin.plugin.register(mockServer)

      expect(callOrder).toEqual(['strategy', 'default'])
    })
  })

  describe('OIDC config handling', () => {
    test('handles OIDC config fetch errors', async () => {
      mockGetOidcConfigs.mockRejectedValue(new Error('OIDC fetch failed'))

      await expect(authPlugin.plugin.register(mockServer)).rejects.toThrow(
        'OIDC fetch failed'
      )
    })

    test('does not register strategy when OIDC fetch fails', async () => {
      mockGetOidcConfigs.mockRejectedValue(new Error('Network error'))

      try {
        await authPlugin.plugin.register(mockServer)
      } catch {
        // Expected to throw
      }

      expect(mockServer.auth.strategy).not.toHaveBeenCalled()
      expect(mockServer.auth.default).not.toHaveBeenCalled()
    })

    test('passes OIDC configs to strategy config generator', async () => {
      const customOidcConfigs = {
        entraIdOidcConfig: {
          issuer: 'https://custom-entra.example.com',
          jwks_uri: 'https://custom-entra.example.com/jwks'
        },
        defraIdOidcConfig: {
          issuer: 'https://custom-defra.example.com',
          jwks_uri: 'https://custom-defra.example.com/jwks'
        }
      }
      mockGetOidcConfigs.mockResolvedValue(customOidcConfigs)

      await authPlugin.plugin.register(mockServer)

      expect(mockGetJwtStrategyConfig).toHaveBeenCalledWith(customOidcConfigs)
    })
  })

  describe('strategy configuration', () => {
    test('registers strategy with all config properties', async () => {
      const fullStrategyConfig = {
        keys: [
          { uri: 'https://entra.example.com/jwks' },
          { uri: 'https://defra.example.com/jwks' }
        ],
        verify: {
          aud: false,
          iss: false,
          sub: false,
          nbf: true,
          exp: true,
          maxAgeSec: 3600,
          timeSkewSec: 15
        },
        validate: vi.fn()
      }
      mockGetJwtStrategyConfig.mockReturnValue(fullStrategyConfig)

      await authPlugin.plugin.register(mockServer)

      expect(mockServer.auth.strategy).toHaveBeenCalledWith(
        'access-token',
        'jwt',
        fullStrategyConfig
      )
    })

    test('uses strategy config exactly as provided by getJwtStrategyConfig', async () => {
      const strategyConfig = {
        keys: [{ uri: 'https://test.example.com/jwks' }],
        verify: { exp: true, nbf: true },
        validate: expect.any(Function),
        customProperty: 'custom-value'
      }
      mockGetJwtStrategyConfig.mockReturnValue(strategyConfig)

      await authPlugin.plugin.register(mockServer)

      const registeredConfig = mockServer.auth.strategy.mock.calls[0][2]
      expect(registeredConfig).toEqual(strategyConfig)
    })
  })

  describe('concurrent plugin registrations', () => {
    test('handles multiple server registrations independently', async () => {
      const mockServer2 = {
        auth: {
          strategy: vi.fn(),
          default: vi.fn()
        }
      }

      await authPlugin.plugin.register(mockServer)
      await authPlugin.plugin.register(mockServer2)

      expect(mockServer.auth.strategy).toHaveBeenCalledTimes(1)
      expect(mockServer2.auth.strategy).toHaveBeenCalledTimes(1)
      expect(mockGetOidcConfigs).toHaveBeenCalledTimes(2)
    })
  })
})
