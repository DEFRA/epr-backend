import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'

import { addStandardUserIfNotPresent } from './add-standard-user-if-not-present.js'
import { ROLES } from '#common/helpers/auth/constants.js'

describe('addStandardUserIfNotPresent', () => {
  let mockRequest
  let mockOrganisationsRepository
  let mockTokenPayload
  let mockOrganisation

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      update: vi.fn()
    }

    mockRequest = {
      organisationsRepository: mockOrganisationsRepository
    }

    mockTokenPayload = {
      email: 'newuser@example.com',
      firstName: 'John',
      lastName: 'Doe',
      contactId: 'contact-123'
    }

    mockOrganisation = {
      id: new ObjectId().toString(),
      version: 1,
      users: []
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when user does not exist in organisation', () => {
    test('should add user to organisation with correct details', async () => {
      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.update).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            {
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [ROLES.standardUser]
            }
          ]
        }
      )
    })

    test('should preserve existing users when adding new user', async () => {
      const existingUser = {
        email: 'existing@example.com',
        fullName: 'Existing User',
        isInitialUser: true,
        roles: [ROLES.standardUser]
      }

      mockOrganisation.users = [existingUser]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            existingUser,
            {
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [ROLES.standardUser]
            }
          ]
        }
      )
    })

    test('should add user with standard_user role', async () => {
      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.roles).toEqual([ROLES.standardUser])
      expect(newUser.roles[0]).toBe('standard_user')
    })

    test('should construct fullName from firstName and lastName', async () => {
      mockTokenPayload.firstName = 'Jane'
      mockTokenPayload.lastName = 'Smith'

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe('Jane Smith')
    })

    test('should use correct organisation id and version for update', async () => {
      const customOrgId = new ObjectId().toString()
      const customVersion = 5

      mockOrganisation.id = customOrgId
      mockOrganisation.version = customVersion

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledWith(
        customOrgId,
        customVersion,
        expect.any(Object)
      )
    })

    test('should handle names with special characters', async () => {
      mockTokenPayload.firstName = "O'Brien"
      mockTokenPayload.lastName = 'Smith-Jones'

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe("O'Brien Smith-Jones")
    })
  })

  describe('when user already exists in organisation', () => {
    test('should not update organisation when user exists by email', async () => {
      mockOrganisation.users = [
        {
          email: 'newuser@example.com',
          fullName: 'Existing User',
          contactId: 'different-contact',
          isInitialUser: false,
          roles: [ROLES.standardUser]
        }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).not.toHaveBeenCalled()
    })

    test('should not update organisation when user exists by contactId', async () => {
      mockOrganisation.users = [
        {
          email: 'different@example.com',
          fullName: 'Existing User',
          contactId: 'contact-123',
          isInitialUser: false,
          roles: [ROLES.standardUser]
        }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).not.toHaveBeenCalled()
    })

    test('should not update organisation when user exists by case-insensitive email match', async () => {
      mockOrganisation.users = [
        {
          email: 'NEWUSER@EXAMPLE.COM',
          fullName: 'Existing User',
          contactId: 'different-contact',
          isInitialUser: false,
          roles: [ROLES.standardUser]
        }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).not.toHaveBeenCalled()
    })

    test('should not update when user exists with same email and contactId', async () => {
      mockOrganisation.users = [
        {
          email: 'newuser@example.com',
          fullName: 'Existing User',
          contactId: 'contact-123',
          roles: [ROLES.standardUser]
        }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).not.toHaveBeenCalled()
    })
  })

  describe('when organisation has no users property', () => {
    test('should add user when users property is undefined', async () => {
      mockOrganisation = {
        id: new ObjectId().toString(),
        version: 1
        // users property is missing/undefined
      }

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.update).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            {
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [ROLES.standardUser]
            }
          ]
        }
      )
    })

    test('should add user when users property is null', async () => {
      mockOrganisation = {
        id: new ObjectId().toString(),
        version: 1,
        users: null
      }

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.update).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            {
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [ROLES.standardUser]
            }
          ]
        }
      )
    })

    test('should initialize empty users array when adding first user', async () => {
      delete mockOrganisation.users

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const usersArray = updateCall[2].users

      expect(usersArray).toHaveLength(1)
      expect(usersArray[0].email).toBe('newuser@example.com')
      expect(usersArray[0].fullName).toBe('John Doe')
    })
  })

  describe('edge cases', () => {
    test('should handle empty string for firstName', async () => {
      mockTokenPayload.firstName = ''
      mockTokenPayload.lastName = 'Doe'

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe(' Doe')
    })

    test('should handle empty string for lastName', async () => {
      mockTokenPayload.firstName = 'John'
      mockTokenPayload.lastName = ''

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe('John ')
    })

    test('should handle organisation with multiple existing users', async () => {
      mockOrganisation.users = [
        {
          email: 'user1@example.com',
          contactId: 'contact-1',
          fullName: 'User One',
          roles: [ROLES.standardUser]
        },
        {
          email: 'user2@example.com',
          contactId: 'contact-2',
          fullName: 'User Two',
          isInitialUser: false,
          roles: [ROLES.standardUser]
        }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      expect(updateCall[2].users).toHaveLength(3)
      expect(updateCall[2].users[0]).toEqual(mockOrganisation.users[0])
      expect(updateCall[2].users[1]).toEqual(mockOrganisation.users[1])
      expect(updateCall[2].users[2].email).toBe('newuser@example.com')
    })

    test('should work with different contactId formats', async () => {
      mockTokenPayload.contactId = '12345-67890-abcdef'

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledOnce()
    })

    test('should propagate repository errors', async () => {
      const repositoryError = new Error('Database connection failed')
      mockOrganisationsRepository.update.mockRejectedValue(repositoryError)

      await expect(
        addStandardUserIfNotPresent(
          mockRequest,
          mockTokenPayload,
          mockOrganisation
        )
      ).rejects.toThrow('Database connection failed')
    })

    test('should handle unicode characters in names', async () => {
      mockTokenPayload.firstName = 'José'
      mockTokenPayload.lastName = 'García'

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.update.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe('José García')
    })
  })

  describe('integration with findUserInOrg', () => {
    test('should correctly identify when user does not exist', async () => {
      mockOrganisation.users = [
        { email: 'other@example.com', contactId: 'other-contact' }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).toHaveBeenCalledOnce()
    })

    test('should correctly identify when user exists by partial match', async () => {
      // User exists with same email but different contactId
      mockOrganisation.users = [
        { email: 'newuser@example.com', contactId: 'different-contact' }
      ]

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.update).not.toHaveBeenCalled()
    })
  })
})
