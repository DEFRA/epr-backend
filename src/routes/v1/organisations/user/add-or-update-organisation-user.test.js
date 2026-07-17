import { USER_ROLES } from '#domain/organisations/model.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { ObjectId } from 'mongodb'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  addOrUpdateOrganisationUser,
  ORGANISATION_USER_RESULTS
} from './add-or-update-organisation-user.js'

/**
 * @import {HapiRequest} from '#common/hapi-types.js'
 * @import {Organisation} from '#domain/organisations/model.js'
 */

describe('addOrUpdateOrganisationUser', () => {
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
      const result = await addOrUpdateOrganisationUser(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.USER_ADDED)

      expect(
        mockOrganisationsRepository.replace
      ).toHaveBeenCalledExactlyOnceWith(
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

      await addOrUpdateOrganisationUser(
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

      const result = await addOrUpdateOrganisationUser(
        fakeRequest,
        /** @type {any} */ ({
          contactId: 'contact-123',
          email: 'existing.user@example.com',
          firstName: 'New Name',
          lastName: 'New Me'
        }),
        org
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.USER_UPDATED)

      const updated = await waitForVersion(organisationsRepository, org.id, 2)

      expect(
        updated.users.filter((u) => u.email === 'existing.user@example.com')
      ).toHaveLength(1)

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

      const result = await addOrUpdateOrganisationUser(
        fakeRequest,
        /** @type {any} */ ({
          email: 'new.email.for.me@example.com',
          firstName: 'New Name',
          lastName: 'New Me',
          contactId: 'contact-123'
        }),
        org
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.USER_UPDATED)

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

    test('should not update when user exists and details have not changed', async () => {
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
          }
        ]
      })

      await organisationsRepository.insert(org)
      await waitForVersion(organisationsRepository, org.id, 1)

      /** @type {Object & Partial<HapiRequest>} */
      const fakeRequest = { organisationsRepository }

      const result = await addOrUpdateOrganisationUser(
        fakeRequest,
        /** @type {any} */ ({
          email: 'existing.user@example.com',
          firstName: 'Existing',
          lastName: 'User',
          contactId: 'contact-123'
        }),
        org
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.NO_CHANGE)
    })
  })

  describe('when organisation has no users property', () => {
    test('should add user when users property is undefined', async () => {
      mockOrganisation = /** @type {Organisation} */ (
        /** @type {unknown} */ ({
          id: new ObjectId().toString(),
          version: 1
          // users property is missing/undefined
        })
      )

      await addOrUpdateOrganisationUser(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(
        mockOrganisationsRepository.replace
      ).toHaveBeenCalledExactlyOnceWith(
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
      mockOrganisation = /** @type {Organisation} */ (
        /** @type {unknown} */ ({
          id: new ObjectId().toString(),
          version: 1,
          users: null
        })
      )

      await addOrUpdateOrganisationUser(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(
        mockOrganisationsRepository.replace
      ).toHaveBeenCalledExactlyOnceWith(
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

      await addOrUpdateOrganisationUser(
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
    test.each([
      ['should handle empty string for firstName', '', 'Doe', 'Doe'],
      ['should handle empty string for lastName', 'John', '', 'John'],
      [
        'should handle unicode characters in names',
        'José',
        'García',
        'José García'
      ]
    ])('%s', async (_description, firstName, lastName, expectedFullName) => {
      mockTokenPayload.firstName = firstName
      mockTokenPayload.lastName = lastName

      await addOrUpdateOrganisationUser(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.replace.mock.calls[0]
      const newUser = updateCall[2].users[0]

      expect(newUser.fullName).toBe(expectedFullName)
    })

    test('should work with different contactId formats', async () => {
      mockTokenPayload.contactId = '12345-67890-abcdef'

      await addOrUpdateOrganisationUser(
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
        addOrUpdateOrganisationUser(
          mockRequest,
          mockTokenPayload,
          mockOrganisation
        )
      ).rejects.toThrow('Database connection failed')
    })
  })
})
