import {
  ORGANISATION_STATUS,
  REPROCESSING_TYPE,
  USER_ROLES
} from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
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
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'

const { validToken } = defraIdMockAuthTokens
const { validToken: serviceMaintainerToken } = entraIdMockAuthTokens
const mockCdpAuditing = vi.fn()
const mockOrganisationLinkedMetric = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

vi.mock(
  import('#common/helpers/metrics/organisation-linking.js'),
  async (importOriginal) => ({
    organisationLinkingMetrics: {
      ...(await importOriginal()).organisationLinkingMetrics,
      organisationLinked: () => mockOrganisationLinkedMetric()
    }
  })
)

const ISO_DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

describe('POST /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  let server
  let organisationsRepositoryFactory
  let organisationsRepository
  const { VALID_FROM, VALID_TO } = getValidDateRange()

  beforeAll(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      },
      featureFlags
    })
  })

  afterAll(() => {
    vi.resetAllMocks()
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
          status: ORGANISATION_STATUS.APPROVED,
          expectedStatusCode: StatusCodes.FORBIDDEN
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: ORGANISATION_STATUS.CREATED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'user is valid',
          user: fullyValidUser,
          status: ORGANISATION_STATUS.REJECTED,
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
                  status: ORGANISATION_STATUS.APPROVED,
                  cbduNumber: org.registrations[0].cbduNumber || 'CBDU123456',
                  registrationNumber: 'REG1',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
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
        const performPostLinkOrganisation = async () => {
          const org = await buildApprovedOrg(organisationsRepository)

          const response = await server.inject({
            method: 'POST',
            url: `/v1/organisations/${org.id}/link`,
            headers: {
              Authorization: `Bearer ${validToken}`
            }
          })

          const finalOrgVersion = await waitForVersion(
            organisationsRepository,
            org.id,
            2
          )
          return { response, finalOrgVersion }
        }

        it('returns 200 status code', async () => {
          const { response } = await performPostLinkOrganisation()

          expect(response.statusCode).toBe(StatusCodes.OK)
        })

        it('returns the expected payload', async () => {
          const { response } = await performPostLinkOrganisation()

          const result = JSON.parse(response.payload)

          expect(result).toEqual({
            status: ORGANISATION_STATUS.ACTIVE,
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
          const { finalOrgVersion } = await performPostLinkOrganisation()

          expect(finalOrgVersion.status).toBe(ORGANISATION_STATUS.ACTIVE)
        })

        it('populates the organisation with a complete "linkedDefraOrganisation" object', async () => {
          const { finalOrgVersion } = await performPostLinkOrganisation()

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

        it('captures a system log', async () => {
          const start = new Date()

          const { finalOrgVersion } = await performPostLinkOrganisation()

          const systemLogsResponse = await server.inject({
            method: 'GET',
            url: `/v1/system-logs?organisationId=${finalOrgVersion.id}`,
            headers: {
              Authorization: `Bearer ${serviceMaintainerToken}`
            }
          })

          expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

          // System log
          const systemLogsResponseBody = JSON.parse(systemLogsResponse.payload)

          expect(systemLogsResponseBody.systemLogs).toHaveLength(1)
          const systemLogPayload = systemLogsResponseBody.systemLogs[0]

          expect(systemLogPayload.createdBy).toEqual({
            id: VALID_TOKEN_CONTACT_ID,
            email: USER_PRESENT_IN_ORG1_EMAIL,
            scope: ['inquirer', 'linker']
          })

          expect(
            new Date(systemLogPayload.createdAt).getTime()
          ).toBeGreaterThanOrEqual(start.getTime())

          expect(systemLogPayload.event).toEqual({
            category: 'entity',
            subCategory: 'epr-organisations',
            action: 'linked-to-defra-id-organisation'
          })

          expect(systemLogPayload.context).toEqual({
            organisationId: finalOrgVersion.id,
            linkedDefraOrganisation: {
              id: COMPANY_1_ID,
              name: COMPANY_1_NAME
            }
          })
        })

        it('captures an audit event', async () => {
          const { finalOrgVersion } = await performPostLinkOrganisation()

          expect(mockCdpAuditing).toHaveBeenCalledTimes(1)

          const auditPayload = mockCdpAuditing.mock.calls[0][0]

          expect(auditPayload.user).toEqual({
            id: VALID_TOKEN_CONTACT_ID,
            email: USER_PRESENT_IN_ORG1_EMAIL,
            scope: ['inquirer', 'linker']
          })

          expect(auditPayload.event).toEqual({
            category: 'entity',
            subCategory: 'epr-organisations',
            action: 'linked-to-defra-id-organisation'
          })

          expect(auditPayload.context).toEqual({
            organisationId: finalOrgVersion.id,
            linkedDefraOrganisation: {
              id: COMPANY_1_ID,
              name: COMPANY_1_NAME
            }
          })
        })

        it('captures a metric', async () => {
          await performPostLinkOrganisation()

          expect(mockOrganisationLinkedMetric).toHaveBeenCalledTimes(1)
        })
      })
    })
  })
})
