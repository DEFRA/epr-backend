import { userPresentInOrg1DefraIdTokenPayload } from '#vite/helpers/create-defra-id-test-tokens.js'
import {
  defraIdMockJwksUrl,
  defraIdMockOidcWellKnownResponse
} from '#vite/helpers/mock-defra-id-oidc.js'
import {
  entraIdMockJwksUrl,
  entraIdMockOidcWellKnownResponse
} from '#vite/helpers/mock-entra-oidc.js'
import Boom from '@hapi/boom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SCOPES, ADMIN_ROLES } from './constants.js'
import { getJwtStrategyConfig } from './get-jwt-strategy-config.js'

const mockGetDefraUserRoles = vi.fn()

const createStrategyConfig = (oidcConfigs) =>
  getJwtStrategyConfig({
    ...oidcConfigs,
    getDefraUserRoles: mockGetDefraUserRoles
  })

const entraIdMockIssuer = /** @type {{ issuer: string }} */ (
  entraIdMockOidcWellKnownResponse
).issuer

const maintainerCredential = {
  role: 'service_maintainer',
  scopes: [...ADMIN_ROLES.service_maintainer]
}
const expectedMaintainerScope = [...ADMIN_ROLES.service_maintainer]

const standardUserCredential = {
  role: null,
  scopes: [SCOPES.organisationLinkedRead, SCOPES.organisationLinkedWrite]
}

const stubRequest = () => ({ path: '/v1/me/organisations' })

// Mock config
const mockConfigGet = vi.fn()

vi.mock('../../../config.js', () => ({
  config: {
    get: (...args) => mockConfigGet(...args)
  }
}))

// Mock getEntraUserRoles
const mockGetEntraUserRoles = vi.fn()

vi.mock('./get-entra-user-roles.js', () => ({
  getEntraUserRoles: (...args) => mockGetEntraUserRoles(...args)
}))

describe('#getJwtStrategyConfig', () => {
  const mockOidcConfigs = {
    entraIdOidcConfig: entraIdMockOidcWellKnownResponse,
    defraIdOidcConfig: defraIdMockOidcWellKnownResponse
  }

  const mockEntraClientId = 'mock-entra-client-id'
  const mockDefraClientId = 'test-defra'

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetEntraUserRoles.mockResolvedValue(maintainerCredential)
    mockGetDefraUserRoles.mockResolvedValue(standardUserCredential)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('configuration structure', () => {
    beforeEach(() => {
      mockConfigGet.mockImplementation((key) => {
        if (key === 'oidc.entraId.clientId') {
          return mockEntraClientId
        }
        if (key === 'oidc.defraId.clientId') {
          return mockDefraClientId
        }
        if (key === 'roles.serviceMaintainers') {
          return JSON.stringify(['maintainer@example.com'])
        }
        return null
      })
    })

    test('returns correct keys configuration with both JWKS URIs', () => {
      const config = createStrategyConfig(mockOidcConfigs)

      expect(config.keys).toEqual([
        {
          uri: entraIdMockJwksUrl
        },
        {
          uri: defraIdMockJwksUrl
        }
      ])
    })

    test('returns correct verify configuration', () => {
      const config = createStrategyConfig(mockOidcConfigs)

      expect(config.verify).toEqual({
        aud: false,
        iss: false,
        sub: false,
        nbf: true,
        exp: true,
        maxAgeSec: 3600,
        timeSkewSec: 15
      })
    })

    test('returns validate function', () => {
      const config = createStrategyConfig(mockOidcConfigs)

      expect(config.validate).toBeTypeOf('function')
    })
  })

  describe('validate function - Entra ID tokens', () => {
    beforeEach(() => {
      mockConfigGet.mockImplementation((key) => {
        if (key === 'oidc.entraId.clientId') {
          return mockEntraClientId
        }
        if (key === 'oidc.defraId.clientId') {
          return mockDefraClientId
        }
        if (key === 'roles.serviceMaintainers') {
          return JSON.stringify(['maintainer@example.com'])
        }
        return null
      })
    })

    test('validates Entra ID token with valid audience and returns credentials', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            preferred_username: 'user@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result).toEqual({
        isValid: true,
        credentials: {
          id: 'contact-123',
          email: 'user@example.com',
          issuer: entraIdMockIssuer,
          role: 'service_maintainer',
          scope: expectedMaintainerScope
        }
      })
    })

    test('credential carries the resolved admin role', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            preferred_username: 'user@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.role).toBe('service_maintainer')
    })

    test('calls getEntraUserRoles with email address from token payload', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const tokenPayload = {
        iss: entraIdMockIssuer,
        aud: mockEntraClientId,
        oid: 'contact-123',
        preferred_username: 'user@example.com'
      }

      const artifacts = {
        decoded: {
          payload: tokenPayload
        }
      }

      await config.validate(artifacts)

      expect(mockGetEntraUserRoles).toHaveBeenCalledWith('user@example.com', [])
      expect(mockGetEntraUserRoles).toHaveBeenCalledTimes(1)
    })

    test('passes the app roles claim to getEntraUserRoles', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            preferred_username: 'regulator@test.gov.uk',
            roles: ['Waste.Regulator.Standard']
          }
        }
      }

      await config.validate(artifacts)

      expect(mockGetEntraUserRoles).toHaveBeenCalledWith(
        'regulator@test.gov.uk',
        ['Waste.Regulator.Standard']
      )
    })

    test('passes an empty app roles list when the token carries no roles claim', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            preferred_username: 'user@example.com'
          }
        }
      }

      await config.validate(artifacts)

      expect(mockGetEntraUserRoles).toHaveBeenCalledWith('user@example.com', [])
    })

    test('credential carries the scope the Entra resolver returned for a regulator', async () => {
      mockGetEntraUserRoles.mockResolvedValue({
        role: 'regulator_standard',
        scopes: [SCOPES.organisationRead, SCOPES.regulator]
      })
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            preferred_username: 'regulator@test.gov.uk',
            roles: ['Waste.Regulator.Standard']
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.role).toBe('regulator_standard')
      expect(result.credentials.scope).toEqual([
        SCOPES.organisationRead,
        SCOPES.regulator
      ])
    })

    test.each([
      ['b@email.com', 'b@email.com'],
      [undefined, undefined],
      [null, null]
    ])(
      'When token.preferred_username is %s, parsed email is %s',
      async (preferredUsername, expected) => {
        const config = createStrategyConfig(mockOidcConfigs)

        const artifacts = {
          decoded: {
            payload: {
              iss: entraIdMockIssuer,
              aud: mockEntraClientId,
              oid: 'contact-123',
              preferred_username: preferredUsername
            }
          }
        }

        const result = await config.validate(artifacts)

        expect(result.credentials.email).toEqual(expected)
        expect(result.isValid).toBe(true)
        expect(mockGetEntraUserRoles).toHaveBeenCalledWith(expected, [])
        expect(mockGetEntraUserRoles).toHaveBeenCalledTimes(1)
      }
    )

    test('throws forbidden error for Entra ID token with invalid audience', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: 'wrong-client-id',
            oid: 'contact-123',
            email: 'user@example.com'
          }
        }
      }

      await expect(config.validate(artifacts)).rejects.toThrow(
        Boom.forbidden('Invalid audience for Entra ID token')
      )
    })

    test('write tier credential carries the full admin scope bundle', async () => {
      mockGetEntraUserRoles.mockResolvedValue({
        role: 'service_maintainer_write',
        scopes: [...ADMIN_ROLES.service_maintainer_write]
      })

      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            email: 'user@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.scope).toEqual([
        ...ADMIN_ROLES.service_maintainer_write
      ])
    })

    test('support tier credential carries the read scopes of that tier', async () => {
      mockGetEntraUserRoles.mockResolvedValue({
        role: 'support',
        scopes: [...ADMIN_ROLES.support]
      })

      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            email: 'support@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.scope).toEqual([...ADMIN_ROLES.support])
    })

    test('handles Entra ID token where user matches no admin tier (empty scope)', async () => {
      mockGetEntraUserRoles.mockResolvedValue({ role: null, scopes: [] })

      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-456',
            email: 'regular-user@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.scope).toEqual([])
    })

    test('handles token payload with missing id field', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            // oid is missing
            email: 'user@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.id).toBeUndefined()
      expect(result.isValid).toBe(true)
    })

    test('handles null values in token payload', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: null,
            email: null,
            preferred_username: null
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.id).toBeNull()
      expect(result.credentials.email).toBeNull()
      expect(result.isValid).toBe(true)
    })

    test('calls config.get for Entra ID client ID', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            email: 'user@example.com'
          }
        }
      }

      await config.validate(artifacts)

      expect(mockConfigGet).toHaveBeenCalledWith('oidc.entraId.clientId')
    })

    test('handles multiple concurrent Entra ID token validations', async () => {
      const config = createStrategyConfig(mockOidcConfigs)

      const artifacts1 = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-1',
            email: 'user1@example.com'
          }
        }
      }

      const artifacts2 = {
        decoded: {
          payload: {
            iss: entraIdMockIssuer,
            aud: mockEntraClientId,
            oid: 'contact-2',
            email: 'user2@example.com'
          }
        }
      }

      const [result1, result2] = await Promise.all([
        config.validate(artifacts1),
        config.validate(artifacts2)
      ])

      expect(result1.credentials.id).toBe('contact-1')
      expect(result2.credentials.id).toBe('contact-2')
      expect(mockGetEntraUserRoles).toHaveBeenCalledTimes(2)
    })
  })

  describe('OIDC config variations', () => {
    beforeEach(() => {
      mockConfigGet.mockImplementation((key) => {
        if (key === 'oidc.entraId.clientId') {
          return mockEntraClientId
        }
        if (key === 'oidc.defraId.clientId') {
          return mockDefraClientId
        }
        if (key === 'roles.serviceMaintainers') {
          return JSON.stringify(['maintainer@example.com'])
        }
        return null
      })
    })

    test('uses jwks_uri from entraIdOidcConfig', () => {
      const customEntraJwksUri = 'https://custom-entra.example.com/jwks'
      const customOidcConfigs = {
        entraIdOidcConfig: {
          ...entraIdMockOidcWellKnownResponse,
          jwks_uri: customEntraJwksUri
        },
        defraIdOidcConfig: defraIdMockOidcWellKnownResponse
      }

      const config = createStrategyConfig(customOidcConfigs)

      expect(config.keys[0].uri).toBe(customEntraJwksUri)
    })

    test('uses jwks_uri from defraIdOidcConfig', () => {
      const customDefraJwksUri = 'https://custom-defra.example.com/jwks'
      const customOidcConfigs = {
        entraIdOidcConfig: entraIdMockOidcWellKnownResponse,
        defraIdOidcConfig: {
          ...defraIdMockOidcWellKnownResponse,
          jwks_uri: customDefraJwksUri
        }
      }

      const config = createStrategyConfig(customOidcConfigs)

      expect(config.keys[1].uri).toBe(customDefraJwksUri)
    })

    test('uses issuer from entraIdOidcConfig for validation', async () => {
      const customIssuer = 'https://custom-entra-issuer.example.com'
      const customOidcConfigs = {
        entraIdOidcConfig: {
          ...entraIdMockOidcWellKnownResponse,
          issuer: customIssuer
        },
        defraIdOidcConfig: defraIdMockOidcWellKnownResponse
      }

      const config = createStrategyConfig(customOidcConfigs)

      const artifacts = {
        decoded: {
          payload: {
            iss: customIssuer,
            aud: mockEntraClientId,
            oid: 'contact-123',
            email: 'user@example.com'
          }
        }
      }

      const result = await config.validate(artifacts)

      expect(result.credentials.issuer).toBe(customIssuer)
    })
  })

  describe('token is a Defra Id token', () => {
    const customOidcConfigs = {
      entraIdOidcConfig: entraIdMockOidcWellKnownResponse,
      defraIdOidcConfig: defraIdMockOidcWellKnownResponse
    }

    beforeEach(() => {
      mockConfigGet.mockImplementation((key) => {
        if (key === 'oidc.entraId.clientId') {
          return mockEntraClientId
        }
        if (key === 'oidc.defraId.clientId') {
          return mockDefraClientId
        }
        return null
      })
    })

    describe('Happy path', () => {
      test('uses issuer from defraIdOidcConfig for validation', async () => {
        const config = createStrategyConfig(customOidcConfigs)
        const artifacts = {
          decoded: { payload: { ...userPresentInOrg1DefraIdTokenPayload } }
        }

        const result = await config.validate(artifacts, stubRequest())

        expect(result.credentials.issuer).toBe(
          userPresentInOrg1DefraIdTokenPayload.iss
        )
      })

      test('resolves Defra ID roles from the token payload and the request', async () => {
        const config = createStrategyConfig(mockOidcConfigs)
        const tokenPayload = {
          aud: mockDefraClientId,
          contactId: 'defra-contact-123',
          email: 'defra-user@example.com',
          iss: defraIdMockOidcWellKnownResponse.issuer
        }
        const request = stubRequest()

        await config.validate({ decoded: { payload: tokenPayload } }, request)

        expect(mockGetDefraUserRoles).toHaveBeenCalledWith(
          tokenPayload,
          request
        )
        expect(mockGetDefraUserRoles).toHaveBeenCalledTimes(1)
      })

      test('credential carries the role and scope the Defra resolver returned', async () => {
        const config = createStrategyConfig(mockOidcConfigs)

        const artifacts = {
          decoded: {
            payload: {
              aud: mockDefraClientId,
              contactId: 'defra-contact-123',
              email: 'defra-user@example.com',
              iss: defraIdMockOidcWellKnownResponse.issuer
            }
          }
        }

        const result = await config.validate(artifacts, stubRequest())

        expect(result.credentials.role).toBeNull()
        expect(result.credentials.scope).toEqual([
          SCOPES.organisationLinkedRead,
          SCOPES.organisationLinkedWrite
        ])
      })

      test.each([
        [
          'includes name from firstName and lastName',
          'Test',
          'User',
          'Test User'
        ],
        ['handles only firstName provided', 'Test', undefined, 'Test'],
        ['handles only lastName provided', undefined, 'User', 'User'],
        [
          'handles neither firstName nor lastName provided',
          undefined,
          undefined,
          ''
        ],
        [
          'trims whitespace from firstName and lastName',
          '  Test  ',
          '  User  ',
          'Test User'
        ],
        ['handles null firstName and lastName', null, null, ''],
        ['handles empty string firstName and lastName', '', '', '']
      ])('%s', async (_description, firstName, lastName, expectedName) => {
        const config = createStrategyConfig(mockOidcConfigs)

        const artifacts = {
          decoded: {
            payload: {
              aud: mockDefraClientId,
              contactId: 'defra-contact-123',
              email: 'defra-user@example.com',
              firstName,
              lastName,
              iss: defraIdMockOidcWellKnownResponse.issuer
            }
          }
        }

        const result = await config.validate(artifacts, stubRequest())

        expect(result.credentials.name).toBe(expectedName)
      })

      test('does not call getEntraUserRoles for Defra ID tokens', async () => {
        const config = createStrategyConfig(mockOidcConfigs)

        const artifacts = {
          decoded: {
            payload: {
              iss: defraIdMockOidcWellKnownResponse.issuer,
              aud: mockDefraClientId,
              id: 'defra-contact-123',
              email: 'defra-user@example.com'
            }
          }
        }

        const result = await config.validate(artifacts, stubRequest())

        expect(mockGetEntraUserRoles).not.toHaveBeenCalled()
        expect(result.credentials.issuer).toBe(
          userPresentInOrg1DefraIdTokenPayload.iss
        )
      })
    })

    describe('Error cases', () => {
      test('throws forbidden error for Defra ID token with invalid audience', async () => {
        const config = createStrategyConfig(customOidcConfigs)

        const artifacts = {
          decoded: {
            payload: {
              ...userPresentInOrg1DefraIdTokenPayload,
              aud: 'wrong-defra-client-id'
            }
          }
        }
        await expect(config.validate(artifacts, stubRequest())).rejects.toThrow(
          Boom.forbidden('Invalid audience for Defra Id token')
        )
      })

      test('handles empty string values in token payload', async () => {
        const config = createStrategyConfig(mockOidcConfigs)

        const artifacts = {
          decoded: {
            payload: {
              aud: mockDefraClientId,
              contactId: '',
              email: '',
              iss: defraIdMockOidcWellKnownResponse.issuer
            }
          }
        }

        const result = await config.validate(artifacts, stubRequest())

        expect(result.credentials.id).toBe('')
        expect(result.credentials.email).toBe('')
        expect(result.isValid).toBe(true)
      })
    })

    describe('concurrent validation with both issuer types', () => {
      test('handles concurrent validations of different issuer types', async () => {
        const config = createStrategyConfig(mockOidcConfigs)

        const entraArtifacts = {
          decoded: {
            payload: {
              iss: entraIdMockIssuer,
              aud: mockEntraClientId,
              oid: 'entra-contact',
              email: 'entra@example.com'
            }
          }
        }

        const defraArtifacts = {
          decoded: {
            payload: {
              aud: mockDefraClientId,
              contactId: 'defra-contact',
              email: 'defra@example.com',
              iss: defraIdMockOidcWellKnownResponse.issuer
            }
          }
        }

        const [entraResult, defraResult] = await Promise.all([
          config.validate(entraArtifacts),
          config.validate(defraArtifacts, stubRequest())
        ])

        expect(entraResult.credentials.id).toBe('entra-contact')
        expect(entraResult.credentials.scope).toEqual(expectedMaintainerScope)
        expect(defraResult.credentials.id).toBe('defra-contact')
        expect(defraResult.credentials.scope).toEqual([
          SCOPES.organisationLinkedRead,
          SCOPES.organisationLinkedWrite
        ])
      })
    })

    describe('unrecognized issuer handling', () => {
      test('throws bad request error for unrecognized issuer', async () => {
        const config = createStrategyConfig(mockOidcConfigs)

        const unknownIssuer = 'https://unknown-issuer.example.com'

        const artifacts = {
          decoded: {
            payload: {
              iss: unknownIssuer,
              aud: 'some-client-id',
              id: 'contact-123',
              email: 'user@example.com'
            }
          }
        }

        await expect(config.validate(artifacts)).rejects.toThrow(
          Boom.badRequest(`Unrecognized token issuer: ${unknownIssuer}`)
        )
      })
    })
  })
})
