import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  defraIdMockAuthTokens,
  VALID_TOKEN_CONTACT_ID,
  VALID_TOKEN_EMAIL_ADDRESS,
  COMPANY_1_ID,
  COMPANY_1_NAME
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { STATUS } from '#domain/organisations/model.js'

const { validToken } = defraIdMockAuthTokens

describe('POST /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      const org1 = buildOrganisation()
      await organisationsRepository.insert(org1)
      return {
        method: 'POST',
        url: `/v1/organisations/${org1.id}/link`
      }
    },
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  describe('the request contains a valid Defra Id token', () => {
    it('when the organisation in the request does not exist, returns 401', async () => {
      const existingOrg = buildOrganisation()
      const nonExistingOrg = buildOrganisation()
      await organisationsRepository.insert(existingOrg)
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${nonExistingOrg.id}/link`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    describe('the request is valid, the org exists', () => {
      const baseUserObject = {
        email: 'random@email.com',
        fullName: 'Mickey Mouse',
        id: 'random_id',
        roles: ['standard_user'],
        isInitialUser: false
      }

      const fullyValidUser = {
        ...baseUserObject,
        email: VALID_TOKEN_EMAIL_ADDRESS,
        isInitialUser: true
      }

      const databaseStateScenarios = [
        {
          description: 'org has no users',
          orgOverride: { users: [] },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is not in the users list',
          orgOverride: {
            users: [baseUserObject]
          },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is NOT an initial user',
          orgOverride: {
            users: [
              {
                ...baseUserObject,
                email: VALID_TOKEN_EMAIL_ADDRESS
              }
            ]
          },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid but is org in the CREATED state',
          orgOverride: {
            users: [fullyValidUser],
            status: STATUS.CREATED
          },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid but org is in the ACTIVE state',
          orgOverride: {
            users: [fullyValidUser],
            status: STATUS.ACTIVE
          },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid but is org in the ARCHIVED state',
          orgOverride: {
            users: [fullyValidUser],
            status: STATUS.ARCHIVED
          },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid but is org in the REJECTED state',
          orgOverride: {
            users: [fullyValidUser],
            status: STATUS.REJECTED
          },
          expectedStatus: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid and org is in the APPROVED state',
          orgOverride: {
            users: [fullyValidUser],
            status: STATUS.APPROVED
          },
          expectedStatus: StatusCodes.OK
        }
      ]

      it.each(databaseStateScenarios)(
        'returns $expectedStatus when $description',
        async ({ orgOverride, expectedStatus }) => {
          const { status, ...restOrgOverrides } = orgOverride

          const org = buildOrganisation({
            ...restOrgOverrides
          })
          await organisationsRepository.insert(org)

          if (status) {
            await organisationsRepository.update(org.id, 1, {
              status
            })
          }
          const response = await server.inject({
            method: 'POST',
            url: `/v1/organisations/${org.id}/link`,
            headers: {
              Authorization: `Bearer ${validToken}`
            }
          })

          expect(response.statusCode).toBe(expectedStatus)
        }
      )

      it('when the request succeeds', async () => {
        const user = {
          email: VALID_TOKEN_EMAIL_ADDRESS,
          fullName: 'Brandom Yuser',
          id: VALID_TOKEN_CONTACT_ID,
          roles: ['standard_user'],
          isInitialUser: true
        }

        const INITIAL_VERSION = 1

        const org = buildOrganisation({
          users: [user]
        })

        await organisationsRepository.insert(org)
        await organisationsRepository.update(org.id, INITIAL_VERSION, {
          status: STATUS.APPROVED
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${org.id}/link`,
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
        expect(response.statusCode).toBe(StatusCodes.OK)
        const result = JSON.parse(response.payload)
        expect(result).toEqual({ status: 'active' })

        const lastOrg = await organisationsRepository.findById(
          org.id,
          INITIAL_VERSION + 1
        )

        expect(lastOrg.status).toBe(STATUS.ACTIVE)
        expect(lastOrg.linkedDefraOrganisation).toEqual({
          orgId: COMPANY_1_ID,
          orgName: COMPANY_1_NAME,
          linkedBy: {
            email: 'someone@test-company.com',
            id: VALID_TOKEN_CONTACT_ID
          },
          linkedAt: expect.any(Date)
        })
      })
    })
  })
})
