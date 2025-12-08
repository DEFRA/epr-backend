import { USER_ROLES } from '#domain/organisations/model.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'

describe('#isAuthorisedOrgLinkingReq', () => {
  const mockOrganisationId = new ObjectId().toString()
  const mockEmail = 'user@example.com'

  let mockRequest
  let mockOrganisationsRepository
  let mockTokenPayload

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      findById: vi.fn()
    }

    mockRequest = {
      path: organisationsLinkPath,
      method: 'post',
      params: {
        organisationId: mockOrganisationId
      },
      organisationsRepository: mockOrganisationsRepository
    }

    mockTokenPayload = {
      email: mockEmail
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path', () => {
    test('returns true when request is org linking request and user is authorised', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        users: [
          {
            email: mockEmail,
            roles: [USER_ROLES.INITIAL]
          }
        ]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })

    test('calls repository with correct organisation ID from params', async () => {
      const customOrgId = new ObjectId().toString()
      mockRequest.params.organisationId = customOrgId

      const mockOrganisation = {
        id: customOrgId,
        users: [{ email: mockEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        customOrgId
      )
    })

    test('uses email from token payload', async () => {
      const customEmail = 'custom@example.com'
      mockTokenPayload.email = customEmail

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: customEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
    })
  })

  describe('non-organisation-linking requests', () => {
    test('returns false when path does not match organisation linking path', async () => {
      mockRequest.path = '/v1/organisations/some-other-path'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('returns false when method is not POST', async () => {
      mockRequest.method = 'get'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('returns false when method is PUT', async () => {
      mockRequest.method = 'put'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
    })

    test('returns false when method is DELETE', async () => {
      mockRequest.method = 'delete'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
    })

    test('returns false when path and method combination is incorrect', async () => {
      mockRequest.path = '/v1/organisations'
      mockRequest.method = 'get'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
    })
  })

  describe('validation errors', () => {
    test('throws unauthorized error when email is missing from token payload', async () => {
      mockTokenPayload.email = undefined

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.unauthorized('Email is required for organisation linking')
      )

      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('throws unauthorized error when email is null', async () => {
      mockTokenPayload.email = null

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.unauthorized('Email is required for organisation linking')
      )
    })

    test('throws unauthorized error when email is empty string', async () => {
      mockTokenPayload.email = ''

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.unauthorized('Email is required for organisation linking')
      )
    })

    test('throws notFound error when organisation does not exist', async () => {
      mockOrganisationsRepository.findById.mockResolvedValue(null)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(Boom.notFound('Organisation not found'))

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })

    test('throws notFound error when organisation is undefined', async () => {
      mockOrganisationsRepository.findById.mockResolvedValue(undefined)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(Boom.notFound('Organisation not found'))
    })

    test('throws forbidden error when user is not an initial user', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        users: [
          {
            email: mockEmail,
            roles: [USER_ROLES.STANDARD]
          }
        ]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.forbidden('user is not authorised to link organisation')
      )

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })

    test('throws forbidden error when user is not found in organisation', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        users: []
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.forbidden('user is not authorised to link organisation')
      )
    })
  })

  describe('edge cases', () => {
    test('handles organisation with multiple users where only one is initial', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        users: [
          { email: 'other@example.com', roles: [USER_ROLES.STANDARD] },
          { email: mockEmail, roles: [USER_ROLES.INITIAL] },
          { email: 'another@example.com', roles: [USER_ROLES.STANDARD] }
        ]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
    })

    test('handles repository error and propagates it', async () => {
      const repositoryError = new Error('Database connection failed')
      mockOrganisationsRepository.findById.mockRejectedValue(repositoryError)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(repositoryError)
    })

    test('handles token payload with additional fields', async () => {
      mockTokenPayload = {
        email: mockEmail,
        id: 'user-123',
        name: 'Test User',
        roles: ['admin'],
        extraField: 'extraValue'
      }

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mockEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
    })

    test('handles organisation with no users array', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        name: 'Test Org'
        // users array missing
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.forbidden('user is not authorised to link organisation')
      )
    })

    test('handles case-sensitive email matching for initial user check', async () => {
      const mixedCaseEmail = 'User@Example.COM'
      mockTokenPayload.email = mixedCaseEmail

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mixedCaseEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
    })
  })

  describe('execution flow', () => {
    test('short-circuits before repository call when not org linking request', async () => {
      mockRequest.path = '/v1/other-path'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('validates email before fetching organisation', async () => {
      mockTokenPayload.email = null
      mockOrganisationsRepository.findById.mockResolvedValue({
        id: mockOrganisationId,
        users: []
      })

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.unauthorized('Email is required for organisation linking')
      )

      // Repository should not be called if email validation fails
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('throws error when organisation is not found', async () => {
      mockOrganisationsRepository.findById.mockResolvedValue(null)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(Boom.notFound('Organisation not found'))
    })

    test('executes all checks in correct order for valid request', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mockEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })
  })

  describe('integration with organisationsLinkPath', () => {
    test('uses the correct path constant from domain', async () => {
      // This test verifies the path constant is used correctly
      mockRequest.path = '/v1/organisations/{organisationId}/link'

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mockEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      // Should process the request since path matches
      expect(result).toBe(true)
    })

    test('handles path with actual organisation ID instead of placeholder', async () => {
      // In real requests, the path will have the actual ID
      mockRequest.path = `/v1/organisations/${mockOrganisationId}/link`

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      // Should return false as path doesn't exactly match the constant
      expect(result).toBe(false)
    })
  })

  describe('method case sensitivity', () => {
    test('handles lowercase post method', async () => {
      mockRequest.method = 'post'

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mockEmail, roles: [USER_ROLES.INITIAL] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
    })

    test('rejects uppercase POST method', async () => {
      mockRequest.method = 'POST'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
    })

    test('rejects mixed case Post method', async () => {
      mockRequest.method = 'Post'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
    })
  })
})
