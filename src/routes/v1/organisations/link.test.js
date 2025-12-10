import { STATUS } from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  COMPANY_1_ID,
  COMPANY_1_NAME,
  defraIdMockAuthTokens,
  USER_PRESENT_IN_ORG1_EMAIL,
  VALID_TOKEN_CONTACT_ID
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'

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
      const nonExistingOrg = buildOrganisation()
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
        email: 'john.doe@email.com',
        fullName: 'John Doe'
      }

      const fullyValidUser = {
        ...baseUserObject,
        email: USER_PRESENT_IN_ORG1_EMAIL,
        isInitialUser: true
      }

      const databaseStateScenarios = [
        {
          description: 'user is not in the users list',
          user: baseUserObject,
          status: STATUS.APPROVED,
          expectedStatusCode: StatusCodes.UNAUTHORIZED
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: STATUS.CREATED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: STATUS.ACTIVE,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: STATUS.ARCHIVED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: STATUS.REJECTED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: STATUS.APPROVED,
          expectedStatusCode: StatusCodes.OK
        }
      ]

      it.each(databaseStateScenarios)(
        'returns $expectedStatusCode when $description and org status is $status',
        async ({ user, status, expectedStatusCode }) => {
          const orgOverride = {
            submitterContactDetails: {
              fullName: user.fullName,
              email: user.email,
              phone: '1234567890',
              jobTitle: 'Director'
            }
          }

          const org = buildOrganisation(orgOverride)

          await organisationsRepository.insert(org)

          if (status) {
            await organisationsRepository.update(org.id, 1, {
              status
            })
          }

          await organisationsRepository.findById(org.id, 2)

          const response = await server.inject({
            method: 'POST',
            url: `/v1/organisations/${org.id}/link`,
            headers: {
              Authorization: `Bearer ${validToken}`
            }
          })

          expect(response.statusCode).toBe(expectedStatusCode)
        }
      )

      describe('when the request succeeds', async () => {
        let response
        let org
        let orginalOrgId
        const INITIAL_VERSION = 1
        let finalOrgVersion

        beforeAll(async () => {
          org = buildOrganisation()
          orginalOrgId = org.id
          console.log('org.id', org.id)

          await organisationsRepository.insert(org)

          const now = new Date()
          const oneYearFromNow = new Date(
            now.getFullYear() + 1,
            now.getMonth(),
            now.getDate()
          )

          // Only approve the first accreditation (which is already linked to the first registration)
          const approvedAccreditations = [
            {
              ...org.accreditations[0],
              status: STATUS.APPROVED,
              accreditationNumber:
                org.accreditations[0].accreditationNumber || 'ACC1',
              validFrom: now,
              validTo: oneYearFromNow
            }
          ]

          const approvedRegistrations = [
            Object.assign({}, org.registrations[0], {
              status: STATUS.APPROVED,
              cbduNumber: org.registrations[0].cbduNumber || 'CBDU123456',
              registrationNumber: 'REG1',
              validFrom: now,
              validTo: oneYearFromNow
            })
          ]

          await organisationsRepository.update(org.id, INITIAL_VERSION, {
            status: STATUS.APPROVED,
            accreditations: approvedAccreditations,
            registrations: approvedRegistrations
          })

          // TODO: For some reason, without this request tests fail
          await organisationsRepository.findById(org.id, INITIAL_VERSION + 1)

          response = await server.inject({
            method: 'POST',
            url: `/v1/organisations/${org.id}/link`,
            headers: {
              Authorization: `Bearer ${validToken}`
            }
          })
          finalOrgVersion = await organisationsRepository.findById(
            orginalOrgId,
            2
          )
        })

        it('returns 200 status code', async () => {
          expect(response.statusCode).toBe(StatusCodes.OK)
        })

        it('returns a payload with `{status: active}`', async () => {
          const result = JSON.parse(response.payload)
          expect(result).toEqual({ status: 'active' })
        })

        it('leaves the organisation in the database with status: "active"', async () => {
          expect(finalOrgVersion.status).toBe(STATUS.ACTIVE)
        })

        it('populates the organisation with a complete "linkedDefraOrganisation" object', async () => {
          expect(finalOrgVersion.linkedDefraOrganisation).toEqual({
            orgId: COMPANY_1_ID,
            orgName: COMPANY_1_NAME,
            linkedBy: {
              email: USER_PRESENT_IN_ORG1_EMAIL,
              id: VALID_TOKEN_CONTACT_ID
            },
            linkedAt: expect.any(Date)
          })
        })

        it('changes all approved accreditation in the organisation to "active"', async () => {
          const previouslyApprovedAccreditations = org.accreditations.filter(
            (acc) => acc.status === STATUS.APPROVED
          )
          const previouslyApprovedAccreditationIds =
            previouslyApprovedAccreditations.map((acc) => acc.id)

          const finalAccreditations = finalOrgVersion.accreditations.filter(
            (acc) => previouslyApprovedAccreditationIds.includes(acc.id)
          )

          expect(finalAccreditations).toHaveLength(
            previouslyApprovedAccreditations.length
          )

          for (const accreditation of finalAccreditations) {
            expect(accreditation.status).toBe(STATUS.ACTIVE)
          }
        })

        it('changes all approved registrations in the organisation to "active"', async () => {
          const previouslyApprovedRegistrations = org.registrations.filter(
            (reg) => reg.status === STATUS.APPROVED
          )
          const previouslyApprovedRegistrationIds =
            previouslyApprovedRegistrations.map((reg) => reg.id)

          const finalRegistrations = finalOrgVersion.registrations.filter(
            (reg) => previouslyApprovedRegistrationIds.includes(reg.id)
          )

          expect(finalRegistrations).toHaveLength(
            previouslyApprovedRegistrations.length
          )

          for (const registration of finalRegistrations) {
            expect(registration.status).toBe(STATUS.ACTIVE)
          }
        })
      })
    })
  })
})
