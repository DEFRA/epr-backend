import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'

// Mock the roles/helpers module
const mockIsInitialUser = vi.fn()

vi.mock('./roles/helpers', () => ({
  isInitialUser: /** @param {any[]} args */ (...args) =>
    mockIsInitialUser(...args)
}))

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
            roles: ['initial_user']
          }
        ]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
      expect(mockIsInitialUser).toHaveBeenCalledWith(
        mockOrganisation,
        mockEmail
      )
    })

    test('calls repository with correct organisation ID from params', async () => {
      const customOrgId = new ObjectId().toString()
      mockRequest.params.organisationId = customOrgId

      const mockOrganisation = {
        id: customOrgId,
        users: [{ email: mockEmail, roles: ['initial_user'] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

      await isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        customOrgId
      )
    })

    test('uses email from token payload', async () => {
      const customEmail = 'custom@example.com'
      mockTokenPayload.email = customEmail

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: customEmail, isInitialUser: true }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

      await isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)

      expect(mockIsInitialUser).toHaveBeenCalledWith(
        mockOrganisation,
        customEmail
      )
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
      expect(mockIsInitialUser).not.toHaveBeenCalled()
    })

    test('returns false when method is not POST', async () => {
      mockRequest.method = 'get'

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(false)
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
      expect(mockIsInitialUser).not.toHaveBeenCalled()
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
      expect(mockIsInitialUser).not.toHaveBeenCalled()
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
      expect(mockIsInitialUser).not.toHaveBeenCalled()
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
            roles: ['standard_user']
          }
        ]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(false)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.forbidden('user is not authorised to link organisation')
      )

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
      expect(mockIsInitialUser).toHaveBeenCalledWith(
        mockOrganisation,
        mockEmail
      )
    })

    test('throws forbidden error when isInitialUser returns falsy value', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        users: []
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(null)

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
          { email: 'other@example.com', roles: ['standard_user'] },
          { email: mockEmail, roles: ['initial_user'] },
          { email: 'another@example.com', roles: ['standard_user'] }
        ]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

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

      expect(mockIsInitialUser).not.toHaveBeenCalled()
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
        users: [{ email: mockEmail, roles: ['initial_user'] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
      expect(mockIsInitialUser).toHaveBeenCalledWith(
        mockOrganisation,
        mockEmail
      )
    })

    test('handles organisation with no users array', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        name: 'Test Org'
        // users array missing
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(false)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(
        Boom.forbidden('user is not authorised to link organisation')
      )

      expect(mockIsInitialUser).toHaveBeenCalledWith(
        mockOrganisation,
        mockEmail
      )
    })

    test('handles case-sensitive email matching through isInitialUser', async () => {
      const mixedCaseEmail = 'User@Example.COM'
      mockTokenPayload.email = mixedCaseEmail

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mixedCaseEmail, isInitialUser: true }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

      const result = await isAuthorisedOrgLinkingReq(
        mockRequest,
        mockTokenPayload
      )

      expect(result).toBe(true)
      expect(mockIsInitialUser).toHaveBeenCalledWith(
        mockOrganisation,
        mixedCaseEmail
      )
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
      expect(mockIsInitialUser).not.toHaveBeenCalled()
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

    test('checks isInitialUser only after organisation is found', async () => {
      mockOrganisationsRepository.findById.mockResolvedValue(null)

      await expect(
        isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)
      ).rejects.toThrow(Boom.notFound('Organisation not found'))

      // isInitialUser should not be called if organisation is not found
      expect(mockIsInitialUser).not.toHaveBeenCalled()
    })

    test('executes all checks in correct order for valid request', async () => {
      const callOrder = []

      mockOrganisationsRepository.findById.mockImplementation(async () => {
        callOrder.push('findById')
        return {
          id: mockOrganisationId,
          users: [{ email: mockEmail, roles: ['initial_user'] }]
        }
      })

      mockIsInitialUser.mockImplementation(() => {
        callOrder.push('isInitialUser')
        return true
      })

      await isAuthorisedOrgLinkingReq(mockRequest, mockTokenPayload)

      expect(callOrder).toEqual(['findById', 'isInitialUser'])
    })
  })

  describe('integration with organisationsLinkPath', () => {
    test('uses the correct path constant from domain', async () => {
      // This test verifies the path constant is used correctly
      mockRequest.path = '/v1/organisations/{organisationId}/link'

      const mockOrganisation = {
        id: mockOrganisationId,
        users: [{ email: mockEmail, roles: ['initial_user'] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

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
        users: [{ email: mockEmail, roles: ['initial_user'] }]
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)
      mockIsInitialUser.mockReturnValue(true)

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
