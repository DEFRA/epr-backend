import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildActiveOrg } from '#vite/helpers/build-active-org.js'
import {
  defraIdMockAuthTokens,
  USER_PRESENT_IN_ORG1_EMAIL,
  VALID_TOKEN_CONTACT_ID
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'

const { validToken } = defraIdMockAuthTokens
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
        expectedStatus: StatusCodes.UNAUTHORIZED
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
    it('adds the user to the organisation when they are not already present', async () => {
      const org = await buildActiveOrg(organisationsRepository)

      const orgBefore = await organisationsRepository.findById(org.id)
      expect(
        orgBefore.users?.find((u) => u.contactId === VALID_TOKEN_CONTACT_ID)
      ).toBeUndefined()

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}/user`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const orgAfter = await organisationsRepository.findById(org.id)
      expect(
        orgAfter.users?.find((u) => u.contactId === VALID_TOKEN_CONTACT_ID)
      ).toMatchObject({
        contactId: VALID_TOKEN_CONTACT_ID,
        email: USER_PRESENT_IN_ORG1_EMAIL
      })
    })

    it('is idempotent — does not create a duplicate if the user already exists', async () => {
      const org = await buildActiveOrg(organisationsRepository)

      await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}/user`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}/user`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const orgAfter = await organisationsRepository.findById(org.id)
      const usersWithContactId = orgAfter.users?.filter(
        (u) => u.contactId === VALID_TOKEN_CONTACT_ID
      )
      expect(usersWithContactId).toHaveLength(1)
    })

    it('captures an audit event', async () => {
      const org = await buildActiveOrg(organisationsRepository)

      await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}/user`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(mockCdpAuditing).toHaveBeenCalledTimes(1)

      const auditPayload = mockCdpAuditing.mock.calls[0][0]

      expect(auditPayload.event).toEqual({
        category: 'entity',
        subCategory: 'epr-organisations',
        action: 'user-added'
      })

      expect(auditPayload.user).toEqual({
        id: VALID_TOKEN_CONTACT_ID,
        email: USER_PRESENT_IN_ORG1_EMAIL,
        scope: ['standard_user']
      })

      expect(auditPayload.context).toEqual({
        organisationId: org.id
      })
    })

    it('captures a system log', async () => {
      const start = new Date()
      const org = await buildActiveOrg(organisationsRepository)

      await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}/user`,
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const systemLogsResponse = await server.inject({
        method: 'GET',
        url: `/v1/system-logs/search?organisationId=${org.id}`,
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

      expect(log.context).toEqual({ organisationId: org.id })

      expect(log.createdBy).toEqual({
        id: VALID_TOKEN_CONTACT_ID,
        email: USER_PRESENT_IN_ORG1_EMAIL,
        scope: ['standard_user']
      })

      expect(new Date(log.createdAt).getTime()).toBeGreaterThanOrEqual(
        start.getTime()
      )
    })
  })
})
