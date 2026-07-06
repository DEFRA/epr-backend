import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildActiveOrg } from '#vite/helpers/build-active-org.js'
import {
  defraIdMockAuthTokens,
  generateValidTokenWith
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'
import { ROLES, SCOPES } from '#common/helpers/auth/constants.js'

const { validToken: serviceMaintainerToken } = entraIdMockAuthTokens
const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (/** @type {any} */ ...args) => mockCdpAuditing(...args)
}))

describe('PUT /v1/organisations/{organisationId}/user', () => {
  setupAuthContext()

  /** @type {import('#test/create-test-server.js').TestServer} */
  let server
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */
  let organisationsRepository

  beforeEach(async () => {
    mockCdpAuditing.mockReset()
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      }
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)
      return {
        method: 'PUT',
        url: `/v1/organisations/${org.id}/user`
      }
    }
  })

  describe('role-based access', () => {
    it.each([
      {
        token: entraIdMockAuthTokens.validToken,
        description: 'Entra service maintainer',
        expectedStatus: StatusCodes.FORBIDDEN
      },
      {
        token: entraIdMockAuthTokens.nonServiceMaintainerUserToken,
        description: 'Entra user without service maintainer role',
        expectedStatus: StatusCodes.FORBIDDEN
      },
      {
        token: defraIdMockAuthTokens.unknownUnauthorisedUserToken,
        description:
          'Defra user with no valid relationship to any organisation',
        expectedStatus: StatusCodes.FORBIDDEN
      },
      {
        token: defraIdMockAuthTokens.validToken,
        description: 'Defra standard user linked to the organisation',
        expectedStatus: StatusCodes.OK
      },
      {
        token: defraIdMockAuthTokens.unknownButAuthorisedUserToken,
        description:
          'Defra user with a relationship pointing to the organisation',
        expectedStatus: StatusCodes.OK
      },
      {
        token: generateValidTokenWith({
          currentRelationshipId: 'org-relationship-id',
          relationships: [
            `org-relationship-id:company-002:another-company-name`
          ]
        }),
        description:
          'Defra user with a relationship pointing to a different organisation',
        expectedStatus: StatusCodes.FORBIDDEN
      }
    ])(
      'returns $expectedStatus for $description',
      async ({ token, expectedStatus }) => {
        const org = await buildActiveOrg(organisationsRepository)
        const response = await server.inject({
          method: 'PUT',
          url: `/v1/organisations/${org.id}/user`,
          headers: { Authorization: `Bearer ${token}` }
        })
        expect(response.statusCode).toBe(expectedStatus)
      }
    )
  })

  describe('when an authorised user hits the endpoint', () => {
    /** @type {import('#domain/organisations/model.js').Organisation} */
    let orgBefore

    /** @type {import('#domain/organisations/model.js').CollatedUser} */
    let initialUser

    beforeEach(async () => {
      const org = await buildActiveOrg(organisationsRepository)
      orgBefore = await organisationsRepository.findById(org.id)
      initialUser = orgBefore.users[0]
    })

    async function addUser(/** @type {Object} */ user) {
      const newUserToken = generateValidTokenWith(user)
      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${orgBefore.id}/user`,
        headers: { Authorization: `Bearer ${newUserToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    }

    describe('when user not present in organisation', () => {
      const newUser = {
        contactId: 'new-user-id',
        email: 'newUser@email.com',
        firstName: 'New',
        lastName: 'Person'
      }

      it('adds the user to the organisation', async () => {
        expect(orgBefore.users).not.toContainEqual(
          expect.objectContaining({
            email: newUser.email
          })
        )

        await addUser(newUser)

        const orgAfter = await organisationsRepository.findById(
          orgBefore.id,
          orgBefore.version + 1
        )

        expect(orgAfter.users).toContainEqual(
          expect.objectContaining({
            contactId: newUser.contactId,
            email: newUser.email
          })
        )
      })

      it('captures an audit event', async () => {
        await addUser(newUser)

        expect(mockCdpAuditing).toHaveBeenCalledTimes(1)

        const auditPayload = mockCdpAuditing.mock.calls[0][0]

        expect(auditPayload.event).toEqual({
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'user-added'
        })

        expect(auditPayload.user).toEqual({
          id: newUser.contactId,
          email: newUser.email,
          scope: [
            SCOPES.organisationLinkedRead,
            SCOPES.organisationLinkedWrite,
            ROLES.standardUser
          ],
          role: null
        })

        expect(auditPayload.context).toEqual({
          organisationId: orgBefore.id,
          previous: null,
          next: {
            contactId: newUser.contactId,
            fullName: `${newUser.firstName} ${newUser.lastName}`,
            email: newUser.email,
            roles: ['standard_user']
          }
        })
      })

      it('captures a system log', async () => {
        const start = new Date()

        await addUser(newUser) // this is needed while the user is added fire-and-forget in the auth layer

        const systemLogsResponse = await server.inject({
          method: 'GET',
          url: `/v1/system-logs/search?organisationId=${orgBefore.id}`,
          headers: { Authorization: `Bearer ${serviceMaintainerToken}` }
        })

        expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

        const { systemLogs } = JSON.parse(systemLogsResponse.payload)
        expect(systemLogs).toHaveLength(1)

        const [log] = systemLogs

        expect(log.event).toEqual({
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'user-added'
        })

        expect(log.context).toEqual({
          organisationId: orgBefore.id,
          previous: null,
          next: {
            contactId: newUser.contactId,
            fullName: `${newUser.firstName} ${newUser.lastName}`,
            email: newUser.email,
            roles: ['standard_user']
          }
        })

        expect(log.createdBy).toEqual({
          id: newUser.contactId,
          email: newUser.email,
          scope: [
            SCOPES.organisationLinkedRead,
            SCOPES.organisationLinkedWrite,
            ROLES.standardUser
          ],
          role: null
        })

        expect(new Date(log.createdAt).getTime()).toBeGreaterThanOrEqual(
          start.getTime()
        )
      })
    })

    describe('when user exists in organisation but details have changed', () => {
      const updatedUser = () => {
        return {
          contactId: 'new-contact-id',
          firstName: initialUser.fullName.split(' ')[0],
          lastName: 'UpdatedLastName',
          email: initialUser.email
        }
      }

      it('updates the user in the organisation', async () => {
        expect(orgBefore.users).not.toContainEqual(
          expect.objectContaining({
            contactId: updatedUser().contactId,
            email: updatedUser().email
          })
        )

        await addUser(updatedUser())

        const orgAfter = await organisationsRepository.findById(
          orgBefore.id,
          orgBefore.version + 1
        )

        expect(orgAfter.users).toContainEqual(
          expect.objectContaining({
            contactId: updatedUser().contactId,
            email: updatedUser().email
          })
        )
      })

      it('captures an audit event', async () => {
        await addUser(updatedUser())

        expect(mockCdpAuditing).toHaveBeenCalledTimes(1)

        const auditPayload = mockCdpAuditing.mock.calls[0][0]

        expect(auditPayload.event).toEqual({
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'user-updated'
        })

        expect(auditPayload.user).toEqual({
          id: updatedUser().contactId,
          email: updatedUser().email,
          scope: [
            SCOPES.organisationLinkedRead,
            SCOPES.organisationLinkedWrite,
            ROLES.standardUser
          ],
          role: null
        })

        expect(auditPayload.context).toEqual({
          organisationId: orgBefore.id,
          previous: {
            fullName: initialUser.fullName,
            email: initialUser.email,
            roles: initialUser.roles
          },
          next: {
            contactId: updatedUser().contactId,
            fullName: `${updatedUser().firstName} ${updatedUser().lastName}`,
            email: updatedUser().email,
            roles: ['initial_user', 'standard_user']
          }
        })
      })

      it('captures a system log', async () => {
        const start = new Date()

        await addUser(updatedUser())

        const systemLogsResponse = await server.inject({
          method: 'GET',
          url: `/v1/system-logs/search?organisationId=${orgBefore.id}`,
          headers: { Authorization: `Bearer ${serviceMaintainerToken}` }
        })

        expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

        const { systemLogs } = JSON.parse(systemLogsResponse.payload)
        expect(systemLogs).toHaveLength(1)

        const [log] = systemLogs

        expect(log.event).toEqual({
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'user-updated'
        })

        expect(log.context).toEqual({
          organisationId: orgBefore.id,
          previous: {
            fullName: initialUser.fullName,
            email: initialUser.email,
            roles: initialUser.roles
          },
          next: {
            contactId: updatedUser().contactId,
            fullName: `${updatedUser().firstName} ${updatedUser().lastName}`,
            email: updatedUser().email,
            roles: ['initial_user', 'standard_user']
          }
        })

        expect(log.createdBy).toEqual({
          id: updatedUser().contactId,
          email: updatedUser().email,
          scope: [
            SCOPES.organisationLinkedRead,
            SCOPES.organisationLinkedWrite,
            ROLES.standardUser
          ],
          role: null
        })

        expect(new Date(log.createdAt).getTime()).toBeGreaterThanOrEqual(
          start.getTime()
        )
      })
    })

    describe('when user already exists in organisation', () => {
      const userNotChanged = () => ({
        contactId: initialUser.contactId,
        firstName: initialUser.fullName.split(' ')[0],
        lastName: initialUser.fullName.split(' ')[1],
        email: initialUser.email
      })

      it('does not update the user in the organisation', async () => {
        await addUser(userNotChanged())

        const orgAfter = await organisationsRepository.findById(
          orgBefore.id,
          orgBefore.version
        )

        expect(orgAfter.users).toEqual(orgBefore.users)
      })

      it('does not capture an audit event', async () => {
        await addUser(userNotChanged())

        expect(mockCdpAuditing).toHaveBeenCalledTimes(0)
      })

      it('does not capture a system log', async () => {
        await addUser(userNotChanged())

        const systemLogsResponse = await server.inject({
          method: 'GET',
          url: `/v1/system-logs/search?organisationId=${orgBefore.id}`,
          headers: { Authorization: `Bearer ${serviceMaintainerToken}` }
        })

        expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

        const { systemLogs } = JSON.parse(systemLogsResponse.payload)
        expect(systemLogs).toHaveLength(0)
      })
    })
  })
})
