import { USER_ROLES } from '#domain/organisations/model.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { ObjectId } from 'mongodb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { addStandardUserIfNotPresent } from './add-standard-user-if-not-present.js'

/**
 * @import {HapiRequest} from '#common/hapi-types.js'
 * @import {Organisation} from '#domain/organisations/model.js'
 */

describe('addStandardUserIfNotPresent', () => {
  let mockRequest
  let mockOrganisationsRepository
  let mockTokenPayload
  let mockOrganisation

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      replace: vi.fn()
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

      expect(mockOrganisationsRepository.replace).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.replace).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            {
              contactId: 'contact-123',
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [USER_ROLES.STANDARD]
            }
          ]
        }
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

      const updateCall = mockOrganisationsRepository.replace.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe("O'Brien Smith-Jones")
    })
  })

  describe('when user already exists in organisation', () => {
    test('should update when user exists by email with changed details', async () => {
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const organisationsRepository = organisationsRepositoryFactory()

      /** @type {Object & Partial<Organisation>} */
      const org = buildOrganisation({
        users: [
          {
            email: 'existing.user@example.com',
            fullName: 'Existing User',
            roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
          },
          {
            email: 'other.user@example.com',
            fullName: 'Tobe Ignored',
            contactId: 'contact-789',
            roles: [USER_ROLES.STANDARD]
          }
        ]
      })

      await organisationsRepository.insert(org)
      await waitForVersion(organisationsRepository, org.id, 1)

      /** @type {Object & Partial<HapiRequest>} */
      const fakeRequest = { organisationsRepository }

      await addStandardUserIfNotPresent(
        fakeRequest,
        /** @type {any} */ ({
          contactId: 'contact-123',
          email: 'existing.user@example.com',
          firstName: 'New Name',
          lastName: 'New Me'
        }),
        org
      )

      const updated = await waitForVersion(organisationsRepository, org.id, 2)

      expect(
        updated.users.filter((u) => u.email === 'existing.user@example.com')
      ).toHaveLength(1)

      console.dir(updated.users, { depth: null })

      expect(updated.users).toEqual(
        expect.arrayContaining([
          {
            email: 'existing.user@example.com',
            fullName: 'New Name New Me',
            contactId: 'contact-123',
            roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
          },
          {
            email: 'other.user@example.com',
            fullName: 'Tobe Ignored',
            contactId: 'contact-789',
            roles: [USER_ROLES.STANDARD]
          }
        ])
      )
    })

    test('should update when user exists by contact-id with changed details', async () => {
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const organisationsRepository = organisationsRepositoryFactory()

      /** @type {Object & Partial<Organisation>} */
      const org = buildOrganisation({
        users: [
          {
            email: 'existing.user@example.com',
            fullName: 'Existing User',
            contactId: 'contact-123',
            roles: [USER_ROLES.STANDARD]
          },
          {
            email: 'other.user@example.com',
            fullName: 'Tobe Ignored',
            contactId: 'contact-789',
            roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
          }
        ]
      })

      await organisationsRepository.insert(org)
      await waitForVersion(organisationsRepository, org.id, 1)

      /** @type {Object & Partial<HapiRequest>} */
      const fakeRequest = { organisationsRepository }

      await addStandardUserIfNotPresent(
        fakeRequest,
        /** @type {any} */ ({
          email: 'new.email.for.me@example.com',
          firstName: 'New Name',
          lastName: 'New Me',
          contactId: 'contact-123'
        }),
        org
      )

      const updated = await waitForVersion(organisationsRepository, org.id, 2)

      expect(
        updated.users.filter((u) => u.contactId === 'contact-123')
      ).toHaveLength(1)

      expect(updated.users).toStrictEqual(
        expect.arrayContaining([
          {
            email: 'new.email.for.me@example.com',
            fullName: 'New Name New Me',
            contactId: 'contact-123',
            roles: [USER_ROLES.STANDARD]
          },
          {
            email: 'other.user@example.com',
            fullName: 'Tobe Ignored',
            contactId: 'contact-789',
            roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
          }
        ])
      )
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

      expect(mockOrganisationsRepository.replace).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.replace).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            {
              contactId: 'contact-123',
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [USER_ROLES.STANDARD]
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

      expect(mockOrganisationsRepository.replace).toHaveBeenCalledOnce()
      expect(mockOrganisationsRepository.replace).toHaveBeenCalledWith(
        mockOrganisation.id,
        mockOrganisation.version,
        {
          users: [
            {
              contactId: 'contact-123',
              email: 'newuser@example.com',
              fullName: 'John Doe',
              roles: [USER_ROLES.STANDARD]
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

      const updateCall = mockOrganisationsRepository.replace.mock.calls[0]
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

      const updateCall = mockOrganisationsRepository.replace.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe('Doe')
    })

    test('should handle empty string for lastName', async () => {
      mockTokenPayload.firstName = 'John'
      mockTokenPayload.lastName = ''

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.replace.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe('John')
    })

    test('should work with different contactId formats', async () => {
      mockTokenPayload.contactId = '12345-67890-abcdef'

      await addStandardUserIfNotPresent(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.replace).toHaveBeenCalledOnce()
    })

    test('should propagate repository errors', async () => {
      const repositoryError = new Error('Database connection failed')
      mockOrganisationsRepository.replace.mockRejectedValue(repositoryError)

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

      const updateCall = mockOrganisationsRepository.replace.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe('José García')
    })
  })
})
