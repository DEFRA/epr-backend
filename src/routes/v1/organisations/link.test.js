import {
  REPROCESSING_TYPE,
  STATUS,
  USER_ROLES
} from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  prepareOrgUpdate
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
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

const ISO_DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

describe('POST /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
  const now = new Date()
  const oneYearFromNow = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate()
  )

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
        roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
      }

      it.each([
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
          status: STATUS.REJECTED,
          expectedStatusCode: StatusCodes.CONFLICT
        }
      ])(
        'returns $expectedStatusCode when $description and org status is $status',
        async ({ user, status, expectedStatusCode }) => {
          const org = buildOrganisation()

          await organisationsRepository.insert(org)

          await organisationsRepository.replace(
            org.id,
            1,
            prepareOrgUpdate(org, {
              submitterContactDetails: {
                fullName: user.fullName,
                email: user.email,
                phone: '1234567890',
                jobTitle: 'Director'
              }
            })
          )

          const orgWithSubmitterDetails = await waitForVersion(
            organisationsRepository,
            org.id,
            2
          )

          await organisationsRepository.replace(
            org.id,
            2,
            prepareOrgUpdate(orgWithSubmitterDetails, {
              status,
              registrations: [
                {
                  ...org.registrations[0],
                  status: STATUS.APPROVED,
                  cbduNumber: org.registrations[0].cbduNumber || 'CBDU123456',
                  registrationNumber: 'REG1',
                  validFrom: now,
                  validTo: oneYearFromNow,
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            })
          )

          await waitForVersion(organisationsRepository, org.id, 3)

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
        let finalOrgVersion

        beforeAll(async () => {
          org = await buildApprovedOrg(organisationsRepository)

          response = await server.inject({
            method: 'POST',
            url: `/v1/organisations/${org.id}/link`,
            headers: {
              Authorization: `Bearer ${validToken}`
            }
          })

          finalOrgVersion = await waitForVersion(
            organisationsRepository,
            org.id,
            2
          )
        })

        it('returns 200 status code', async () => {
          expect(response.statusCode).toBe(StatusCodes.OK)
        })

        it('returns the expected payload', async () => {
          const result = JSON.parse(response.payload)

          expect(result).toEqual({
            status: 'active',
            linked: {
              id: COMPANY_1_ID,
              name: COMPANY_1_NAME,
              linkedAt: expect.stringMatching(ISO_DATE_STRING_REGEX),
              linkedBy: {
                email: USER_PRESENT_IN_ORG1_EMAIL,
                id: VALID_TOKEN_CONTACT_ID
              }
            }
          })
        })

        it('leaves the organisation in the database with status: "active"', async () => {
          expect(finalOrgVersion.status).toBe(STATUS.ACTIVE)
        })

        it('populates the organisation with a complete "linkedDefraOrganisation" object', async () => {
          expect(finalOrgVersion.linkedDefraOrganisation).toEqual({
            orgId: COMPANY_1_ID,
            orgName: COMPANY_1_NAME,
            linkedAt: expect.any(Date),
            linkedBy: {
              email: USER_PRESENT_IN_ORG1_EMAIL,
              id: VALID_TOKEN_CONTACT_ID
            }
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
