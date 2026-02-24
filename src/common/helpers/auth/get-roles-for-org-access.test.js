import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ROLES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { userPresentInOrg1DefraIdTokenPayload } from '#vite/helpers/create-defra-id-test-tokens.js'
import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'

describe('#getRolesForOrganisationAccess', () => {
  const mockOrganisationId = new ObjectId().toString()
  const mockLinkedEprOrg = mockOrganisationId

  let mockRequest
  let mockOrganisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      findById: vi.fn(),
      replace: vi.fn()
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
    test.each([['ACTIVE', ORGANISATION_STATUS.ACTIVE]])(
      'returns standard_user role when organisation is %s',
      async (statusName, status) => {
        const mockOrganisation = {
          id: mockOrganisationId,
          status,
          users: [],
          version: 1
        }

        mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

        const result = await getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          userPresentInOrg1DefraIdTokenPayload
        )

        expect(result).toEqual([ROLES.standardUser])
        expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
          mockOrganisationId
        )
      }
    )

    test('calls repository with correct organisation ID from params', async () => {
      const customOrgId = new ObjectId().toString()
      mockRequest.params.organisationId = customOrgId

      const mockOrganisation = {
        id: customOrgId,
        status: ORGANISATION_STATUS.ACTIVE,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await getRolesForOrganisationAccess(
        mockRequest,
        customOrgId,
        userPresentInOrg1DefraIdTokenPayload
      )

      expect(mockOrganisationsRepository.findById).toHaveBeenCalledWith(
        customOrgId
      )
    })
  })

  describe('no organisation ID in params', () => {
    test.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', '']
    ])(
      'returns empty array when organisationId is %s',
      async (description, orgIdValue) => {
        mockRequest.params.organisationId = orgIdValue

        const result = await getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          userPresentInOrg1DefraIdTokenPayload
        )

        expect(result).toEqual([])
        expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
      }
    )

    test('returns empty array when params object is missing', async () => {
      mockRequest.params = undefined

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          userPresentInOrg1DefraIdTokenPayload
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
          userPresentInOrg1DefraIdTokenPayload
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
          userPresentInOrg1DefraIdTokenPayload
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
        status: ORGANISATION_STATUS.ACTIVE
      })

      await expect(
        getRolesForOrganisationAccess(
          mockRequest,
          differentOrgId,
          userPresentInOrg1DefraIdTokenPayload
        )
      ).rejects.toThrow(Boom.forbidden('Access denied: organisation mismatch'))

      // Repository should not be called if IDs don't match
      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('organisation status not accessible', () => {
    test.each([
      ['CREATED', ORGANISATION_STATUS.CREATED],
      ['APPROVED', ORGANISATION_STATUS.APPROVED],
      ['REJECTED', ORGANISATION_STATUS.REJECTED],
      ['undefined', undefined],
      ['null', null]
    ])(
      'throws forbidden error when organisation status is %s',
      async (statusName, status) => {
        const mockOrganisation = {
          id: mockOrganisationId,
          status,
          users: [],
          version: 1
        }

        mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

        await expect(
          getRolesForOrganisationAccess(
            mockRequest,
            mockLinkedEprOrg,
            userPresentInOrg1DefraIdTokenPayload
          )
        ).rejects.toThrow(
          Boom.forbidden('Access denied: organisation status not accessible')
        )
      }
    )

    test('throws forbidden error with exact message format for non-accessible status', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: ORGANISATION_STATUS.REJECTED,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      try {
        await getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          userPresentInOrg1DefraIdTokenPayload
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
    test.each([
      [
        'propagates repository error when findById fails',
        () => {
          const error = new Error('Database connection failed')
          mockOrganisationsRepository.findById.mockRejectedValue(error)
          return error
        }
      ],
      [
        'propagates error when findById returns null',
        () => {
          mockOrganisationsRepository.findById.mockResolvedValue(null)
          return undefined
        }
      ],
      [
        'handles timeout error from repository',
        () => {
          const error = new Error('Query timeout')
          mockOrganisationsRepository.findById.mockRejectedValue(error)
          return error
        }
      ]
    ])('%s', async (description, setupMock) => {
      const expectedError = setupMock()

      const promise = getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
      )

      if (expectedError) {
        await expect(promise).rejects.toThrow(expectedError)
      } else {
        await expect(promise).rejects.toThrow()
      }
    })
  })

  describe('edge cases', () => {
    test('handles organisation with additional fields', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: ORGANISATION_STATUS.ACTIVE,
        name: 'Test Organisation',
        users: [{ email: 'test@example.com' }],
        version: 1,
        createdAt: new Date(),
        metadata: { foo: 'bar' }
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,

        userPresentInOrg1DefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })

    test('handles organisation ID with different formats', async () => {
      const objectIdFormat = new ObjectId().toString()
      mockRequest.params.organisationId = objectIdFormat

      const mockOrganisation = {
        id: objectIdFormat,
        status: ORGANISATION_STATUS.ACTIVE,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        objectIdFormat,
        userPresentInOrg1DefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })

    test('handles case where status matches by reference', async () => {
      const activeStatus = ORGANISATION_STATUS.ACTIVE
      const mockOrganisation = {
        id: mockOrganisationId,
        status: activeStatus,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
    })

    test('returns array with single role, not just the role string', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: ORGANISATION_STATUS.ACTIVE,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
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
        userPresentInOrg1DefraIdTokenPayload
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
          userPresentInOrg1DefraIdTokenPayload
        )
      ).rejects.toThrow()

      expect(mockOrganisationsRepository.findById).not.toHaveBeenCalled()
    })

    test('fetches organisation only after validation passes', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: ORGANISATION_STATUS.ACTIVE,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
      )

      expect(
        mockOrganisationsRepository.findById
      ).toHaveBeenCalledExactlyOnceWith(mockOrganisationId)
    })

    test('executes all checks in correct order for valid request', async () => {
      const callOrder = []

      mockOrganisationsRepository.findById.mockImplementation(
        async (/** @type {string} */ id) => {
          callOrder.push(`findById:${id}`)
          return {
            id: mockOrganisationId,
            status: ORGANISATION_STATUS.ACTIVE,
            users: [],
            version: 1
          }
        }
      )

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
      )

      expect(callOrder).toEqual([`findById:${mockOrganisationId}`])
      expect(result).toEqual([ROLES.standardUser])
    })
  })

  describe('status comparison', () => {
    test('only ACTIVE status is accessible', async () => {
      const accessibleStatuses = [ORGANISATION_STATUS.ACTIVE]
      const nonAccessibleStatuses = [
        ORGANISATION_STATUS.CREATED,
        ORGANISATION_STATUS.APPROVED,
        ORGANISATION_STATUS.REJECTED
      ]

      // Test accessible statuses
      for (const status of accessibleStatuses) {
        const mockOrganisation = {
          id: mockOrganisationId,
          status,
          users: [],
          version: 1
        }

        mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

        const result = await getRolesForOrganisationAccess(
          mockRequest,
          mockLinkedEprOrg,
          userPresentInOrg1DefraIdTokenPayload
        )

        expect(result).toEqual([ROLES.standardUser])
      }

      // Test non-accessible statuses
      for (const status of nonAccessibleStatuses) {
        const mockOrganisation = {
          id: mockOrganisationId,
          status,
          users: [],
          version: 1
        }

        mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

        await expect(
          getRolesForOrganisationAccess(
            mockRequest,
            mockLinkedEprOrg,
            userPresentInOrg1DefraIdTokenPayload
          )
        ).rejects.toThrow(
          Boom.forbidden('Access denied: organisation status not accessible')
        )
      }
    })

    test('status comparison is exact match', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: 'active', // Same value as STATUS.ACTIVE
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
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
        userPresentInOrg1DefraIdTokenPayload
      )
      expect(Array.isArray(result)).toBe(true)

      // Test with accessible organisation
      mockRequest.params.organisationId = mockOrganisationId
      const mockOrganisation = {
        id: mockOrganisationId,
        status: ORGANISATION_STATUS.ACTIVE,
        users: [],
        version: 1
      }
      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
      )
      expect(Array.isArray(result)).toBe(true)
    })

    test('returns array containing only standard_user role constant', async () => {
      const mockOrganisation = {
        id: mockOrganisationId,
        status: ORGANISATION_STATUS.ACTIVE,
        users: [],
        version: 1
      }

      mockOrganisationsRepository.findById.mockResolvedValue(mockOrganisation)

      const result = await getRolesForOrganisationAccess(
        mockRequest,
        mockLinkedEprOrg,
        userPresentInOrg1DefraIdTokenPayload
      )

      expect(result).toEqual([ROLES.standardUser])
      expect(result[0]).toBe('standard_user')
    })
  })
})
