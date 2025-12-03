import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'

import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'
import { STATUS } from '#domain/organisations/model.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { baseDefraIdTokenPayload } from '#vite/helpers/create-defra-id-test-tokens.js'

describe('#getRolesForOrganisationAccess', () => {
  const mockOrganisationId = new ObjectId().toString()
  const mockLinkedEprOrg = mockOrganisationId

  let mockRequest
  let mockOrganisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      findById: vi.fn()
    }

    mockRequest = {
      params: {
        organisationId: mockOrganisationId
      },
      organisationsRepository: mockOrganisationsRepository
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('happy path', () => {
    test('returns standard_user role when organisation is ACTIVE', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })

    test('returns standard_user role when organisation is SUSPENDED', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.SUSPENDED
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })

    test('calls repository with correct organisation ID from params', async () => {
      const customOrgId = new ObjectId().toString()
      mockRequest.params.organisationId = customOrgId

      const mockOrganisation = {
        id: customOrgId,
        status: STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await getRolesForOrganisationAccess(
        mockRequest,
        customOrgId,
        baseDefraIdTokenPayload
      )

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        customOrgId
      )
    })
  })

  describe('no organisation ID in params', () => {
    test('returns empty array when organisationId is undefined', async () => {
      mockRequest.params.organisationId = undefined

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([])
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('returns empty array when organisationId is null', async () => {
      mockRequest.params.organisationId = null

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([])
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('returns empty array when organisationId is empty string', async () => {
      mockRequest.params.organisationId = ''

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([])
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('returns empty array when params object is missing', async () => {
      mockRequest.params = undefined

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow()
    })
  })

  describe('organisation mismatch', () => {
    test('throws forbidden error when organisationId does not match linkedEprOrg', async () => {
      const differentOrgId = new ObjectId().toString()

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          differentOrgId,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(Boom.forbidden('Access denied: organisation mismatch'))

      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('throws forbidden error with exact message format', async () => {
      const differentOrgId = new ObjectId().toString()

      try {
        await getRolesForOrganisationAccess(
          mockRequest,
          differentOrgId,
          baseDefraIdTokenPayload
        )
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(403)
        expect(error.message).toBe('Access denied: organisation mismatch')
      }
    })

    test('validates organisation match before fetching from repository', async () => {
      const differentOrgId = new ObjectId().toString()
      mockOrganisationsRepository.findById.mockResolvedValue({
        id: mockOrganisationId,
        status: STATUS.ACTIVE
      })

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          differentOrgId,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(Boom.forbidden('Access denied: organisation mismatch'))

      // Repository should not be called if IDs don't match
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('organisation status not accessible', () => {
    test('throws forbidden error when organisation status is CREATED', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.CREATED
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(
        Boom.forbidden('Access denied: organisation status not accessible')
      )
    })

    test('throws forbidden error when organisation status is APPROVED', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.APPROVED
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(
        Boom.forbidden('Access denied: organisation status not accessible')
      )
    })

    test('throws forbidden error when organisation status is REJECTED', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.REJECTED
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(
        Boom.forbidden('Access denied: organisation status not accessible')
      )
    })

    test('throws forbidden error when organisation status is ARCHIVED', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ARCHIVED
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(
        Boom.forbidden('Access denied: organisation status not accessible')
      )
    })

    test('throws forbidden error when organisation status is undefined', async () => {
      const mockOrganisation = {
        id: mockOrganisationId
        // status is missing
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(
        Boom.forbidden('Access denied: organisation status not accessible')
      )
    })

    test('throws forbidden error when organisation status is null', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: null
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(
        Boom.forbidden('Access denied: organisation status not accessible')
      )
    })

    test('throws forbidden error with exact message format for non-accessible status', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.REJECTED
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      try {
        await getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.isBoom).toBe(true)
        expect(error.output.statusCode).toBe(403)
        expect(error.message).toBe(
          'Access denied: organisation status not accessible'
        )
      }
    })
  })

  describe('repository errors', () => {
    test('propagates repository error when findById fails', async () => {
      const repositoryError = new Error('Database connection failed')
      mockOrganisationsRepository.findById.mockRejectedValue(repositoryError)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(repositoryError)
    })

    test('propagates error when findById returns null', async () => {
      mockOrganisationsRepository.findById.mockResolvedValue(null)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow()
    })

    test('handles timeout error from repository', async () => {
      const timeoutError = new Error('Query timeout')
      mockOrganisationsRepository.findById.mockRejectedValue(timeoutError)

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow(timeoutError)
    })
  })

  describe('edge cases', () => {
    test('handles organisation with additional fields', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ACTIVE,
        name: 'Test Organisation',
        users: [{ email: 'test@example.com' }],
        createdAt: new Date(),
        metadata: { foo: 'bar' }
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,

        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })

    test('handles organisation ID with different formats', async () => {
      const objectIdFormat = new ObjectId().toString()
      mockRequest.params.organisationId = objectIdFormat

      const mockOrganisation = {
        id: objectIdFormat,
        status: STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        objectIdFormat,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })

    test('handles case where status matches by reference', async () => {
      const activeStatus = STATUS.ACTIVE
      const mockOrganisation = {
        id: mockOrganisationId,
        status: activeStatus
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })

    test('returns array with single role, not just the role string', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0]).toBe(ROLES.standardUser)
    })
  })

  describe('execution flow', () => {
    test('short-circuits before repository call when no organisationId', async () => {
      mockRequest.params.organisationId = undefined

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([])
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('validates organisation match before fetching from repository', async () => {
      const differentOrgId = new ObjectId().toString()

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          differentOrgId,
          baseDefraIdTokenPayload
        )
      ).rejects.toThrow()

      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('fetches organisation only after validation passes', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        mockOrganisationId
      )
    })

    test('executes all checks in correct order for valid request', async () => {
      const callOrder = []

      mockOrganisationsRepository.findById.mockImplementation(
        async (/** @type {string} */ id) => {
          callOrder.push(`findById:${id}`)
          return {
            id: mockOrganisationId,
            status: STATUS.ACTIVE
          }
        }
      )

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(callOrder).toEqual([`findById:${mockOrganisationId}`])
      expect(result).toEqual([ROLES.standardUser])
    })
  })

  describe('status comparison', () => {
    test('only ACTIVE and SUSPENDED statuses are accessible', async () => {
      const accessibleStatuses = [STATUS.ACTIVE, STATUS.SUSPENDED]
      const nonAccessibleStatuses = [
        STATUS.CREATED,
        STATUS.APPROVED,
        STATUS.REJECTED,
        STATUS.ARCHIVED
      ]

      // Test accessible statuses
      for (const status of accessibleStatuses) {
        const mockOrganisation = {
          id: mockOrganisationId,
          status
        }

        mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

        const result = await getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          baseDefraIdTokenPayload
        )

        expect(result).toEqual([ROLES.standardUser])
      }

      // Test non-accessible statuses
      for (const status of nonAccessibleStatuses) {
        const mockOrganisation = {
          id: mockOrganisationId,
          status
        }

        mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

        await expect(
          getRolesForOrganisationAccess(
            mockRequest,
            mockLinkedEprOrg,
            baseDefraIdTokenPayload
          )
        ).rejects.toThrow(
          Boom.forbidden('Access denied: organisation status not accessible')
        )
      }
    })

    test('status comparison is exact match', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: 'active' // Same value as STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })
  })

  describe('return value', () => {
    test('always returns an array', async () => {
      // Test with no organisationId
      mockRequest.params.organisationId = undefined
      let result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )
      expect(Array.isArray(result)).toBe(true)

      // Test with accessible organisation
      mockRequest.params.organisationId = mockOrganisationId
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ACTIVE
      }
      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )
      expect(Array.isArray(result)).toBe(true)
    })

    test('returns array containing only standard_user role constant', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: STATUS.ACTIVE
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        baseDefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
      expect(result[0]).toBe('standard_user')
    })
  })
})
