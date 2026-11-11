import { USER_ROLES } from '#domain/organisations/model.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { partialMock } from '#test/type-helpers.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  addOrUpdateOrganisationUser,
  ORGANISATION_USER_RESULTS
} from './add-or-update-organisation-user.js'

const { buildOrganisation } = createOrganisationBuilders()

/**
 * @import {Mock} from 'vitest'
 * @import {DefraIdTokenPayload} from '#auth/types.js'
 * @import {HapiRequest} from '#common/hapi-types.js'
 * @import {Organisation} from '#domain/organisations/model.js'
 * @import {OrganisationUsers} from './add-or-update-organisation-user.js'
 */

/**
 * The stored organisation's users as the read model shows them.
 *
 * @param {Pick<Organisation, 'organisationNumber' | 'version' | 'users'>} organisation
 * @returns {OrganisationUsers}
 */
const asReadModel = ({ organisationNumber, version, users }) => ({
  organisationNumber,
  version,
  users
})

describe('addOrUpdateOrganisationUser', () => {
  /** @type {HapiRequest} */
  let mockRequest
  /** @type {{ replaceUsers: Mock }} */
  let mockOrganisationsRepository
  /** @type {DefraIdTokenPayload} */
  let mockTokenPayload
  /** @type {OrganisationUsers} */
  let mockOrganisation

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrganisationsRepository = {
      replaceUsers: vi.fn()
    }

    mockRequest = partialMock({
      organisationsRepository: partialMock(mockOrganisationsRepository)
    })

    mockTokenPayload = partialMock({
      email: 'newuser@example.com',
      firstName: 'John',
      lastName: 'Doe',
      contactId: 'contact-123'
    })

    mockOrganisation = {
      organisationNumber: toOrganisationNumber('500001'),
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
        mockOrganisationsRepository.replaceUsers
      ).toHaveBeenCalledExactlyOnceWith('500001', mockOrganisation.version, [
        {
          contactId: 'contact-123',
          email: 'newuser@example.com',
          fullName: 'John Doe',
          roles: [USER_ROLES.STANDARD]
        }
      ])
    })

    test('should handle names with special characters', async () => {
      mockTokenPayload.firstName = "O'Brien"
      mockTokenPayload.lastName = 'Smith-Jones'

      await addOrUpdateOrganisationUser(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      const updateCall = mockOrganisationsRepository.replaceUsers.mock.calls[0]
      const newUser = updateCall[2][0]

      expect(newUser.fullName).toBe("O'Brien Smith-Jones")
    })
  })

  describe('when user already exists in organisation', () => {
    test('should update when user exists by email with changed details', async () => {
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([])
      const organisationsRepository = organisationsRepositoryFactory()

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

      /** @type {HapiRequest} */
      const fakeRequest = partialMock({ organisationsRepository })

      const result = await addOrUpdateOrganisationUser(
        fakeRequest,
        partialMock({
          contactId: 'contact-123',
          email: 'existing.user@example.com',
          firstName: 'New Name',
          lastName: 'New Me'
        }),
        asReadModel(org)
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.USER_UPDATED)

      /** @type {Organisation} */
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

      /** @type {HapiRequest} */
      const fakeRequest = partialMock({ organisationsRepository })

      const result = await addOrUpdateOrganisationUser(
        fakeRequest,
        partialMock({
          email: 'new.email.for.me@example.com',
          firstName: 'New Name',
          lastName: 'New Me',
          contactId: 'contact-123'
        }),
        asReadModel(org)
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.USER_UPDATED)

      /** @type {Organisation} */
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

      /** @type {HapiRequest} */
      const fakeRequest = partialMock({ organisationsRepository })

      const result = await addOrUpdateOrganisationUser(
        fakeRequest,
        partialMock({
          email: 'existing.user@example.com',
          firstName: 'Existing',
          lastName: 'User',
          contactId: 'contact-123'
        }),
        asReadModel(org)
      )

      expect(result.outcome).toBe(ORGANISATION_USER_RESULTS.NO_CHANGE)
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

      const updateCall = mockOrganisationsRepository.replaceUsers.mock.calls[0]
      const newUser = updateCall[2][0]

      expect(newUser.fullName).toBe(expectedFullName)
    })

    test('should work with different contactId formats', async () => {
      mockTokenPayload.contactId = '12345-67890-abcdef'

      await addOrUpdateOrganisationUser(
        mockRequest,
        mockTokenPayload,
        mockOrganisation
      )

      expect(mockOrganisationsRepository.replaceUsers).toHaveBeenCalledOnce()
    })

    test('should propagate repository errors', async () => {
      const repositoryError = new Error('Database connection failed')
      mockOrganisationsRepository.replaceUsers.mockRejectedValue(
        repositoryError
      )

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
