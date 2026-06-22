import crypto from 'node:crypto'
import {
  ORGANISATION_STATUS,
  REPROCESSING_TYPE
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
import { generateValidTokenWith } from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { StatusCodes } from 'http-status-codes'
import {
  asServiceMaintainer,
  asServiceMaintainerWrite
} from '#test/inject-auth.js'

const mockCdpAuditing = vi.fn()
const mockOrganisationLinkedMetric = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (/** @type {any} */ ...args) => mockCdpAuditing(...args)
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

function submitterContactDetails(/** @type {string} */ email) {
  return {
    submitterContactDetails: {
      fullName: 'Users name',
      email,
      phone: '1234567890',
      jobTitle: 'Director'
    }
  }
}

/**
 * @param {{
 *   defraIdContactId?: string,
 *   email?: string,
 *   defraIdOrganisationId?: string,
 *   defraIdOrganisationName?: string,
 *   relationshipId?: string
 *   relationships?: string[]
 * }} param0
 * @returns
 */
function defraIdJwtTokenWith({
  defraIdContactId = crypto.randomUUID(),
  email = 'user@email.com',
  defraIdOrganisationId = crypto.randomUUID(),
  defraIdOrganisationName = 'some org ltd',
  relationshipId = crypto.randomUUID(),
  relationships = [
    `${relationshipId}:${defraIdOrganisationId}:${defraIdOrganisationName}`
  ]
}) {
  return generateValidTokenWith({
    contactId: defraIdContactId,
    email,
    currentRelationshipId: relationshipId,
    relationships
  })
}

describe('POST /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  /** @type {import('#test/create-test-server.js').TestServer} */
  let server
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */
  let organisationsRepository
  const { VALID_FROM, VALID_TO } = getValidDateRange()

  beforeAll(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository()
      },
      featureFlags: createInMemoryFeatureFlags()
    })
  })

  afterAll(() => {
    vi.resetAllMocks()
  })

  const performLink = async (
    /** @type {string} */ organisationId,
    /** @type {string} */ jwtAccessToken
  ) => {
    return await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/link`,
      headers: {
        Authorization: `Bearer ${jwtAccessToken}`
      }
    })
  }

  const performUnlink = async (/** @type {string} */ organisationId) => {
    return await server.inject({
      method: 'DELETE',
      url: `/v1/organisations/${organisationId}/link`,
      ...asServiceMaintainerWrite()
    })
  }

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
    it('when the organisation in the request does not exist, returns 404', async () => {
      const organisationId = 'some-uuid-for-an-org-that-is-not-in-the-service'
      const response = await performLink(
        organisationId,
        defraIdJwtTokenWith({})
      )
      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    describe('the request is valid, the org exists', () => {
      const user1Email = 'user1@email.com'
      const user2Email = 'user2@email.com'

      it.each([
        {
          description:
            'user email in token does not match any user for the organisation',
          userEmailOnOrg: user1Email,
          defraIdJwtToken: defraIdJwtTokenWith({ email: user2Email }),
          status: ORGANISATION_STATUS.APPROVED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'organisation in "created" state',
          userEmailOnOrg: user1Email,
          defraIdJwtToken: defraIdJwtTokenWith({ email: user1Email }),
          status: ORGANISATION_STATUS.CREATED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'organisation in "rejected" state',
          userEmailOnOrg: user1Email,
          defraIdJwtToken: defraIdJwtTokenWith({ email: user1Email }),
          status: ORGANISATION_STATUS.REJECTED,
          expectedStatusCode: StatusCodes.CONFLICT
        },
        {
          description: 'organisation in "approved" state',
          userEmailOnOrg: user1Email,
          defraIdJwtToken: defraIdJwtTokenWith({ email: user1Email }),
          status: ORGANISATION_STATUS.APPROVED,
          expectedStatusCode: StatusCodes.OK
        },
        {
          description: 'defra ID token does not have organisation data',
          userEmailOnOrg: user1Email,
          defraIdJwtToken: defraIdJwtTokenWith({
            email: user1Email,
            relationships: []
          }),
          status: ORGANISATION_STATUS.APPROVED,
          expectedStatusCode: StatusCodes.BAD_REQUEST
        }
      ])(
        'returns $expectedStatusCode when $description and org status is $status',
        async ({
          userEmailOnOrg,
          defraIdJwtToken,
          status,
          expectedStatusCode
        }) => {
          const org = buildOrganisation(submitterContactDetails(userEmailOnOrg))
          await organisationsRepository.insert(org)

          await organisationsRepository.replace(
            org.id,
            org.version,
            prepareOrgUpdate(org, {
              status,
              registrations: [
                {
                  ...org.registrations[0],
                  status: ORGANISATION_STATUS.APPROVED,
                  cbduNumber:
                    /** @type {import('#domain/organisations/registration.js').RegistrationOther} */ (
                      org.registrations[0]
                    ).cbduNumber || 'CBDU123456',
                  registrationNumber: 'REG1',
                  validFrom: VALID_FROM,
                  validTo: VALID_TO,
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ],
              accreditations: [
                {
                  ...org.accreditations[0],
                  reprocessingType: REPROCESSING_TYPE.INPUT
                }
              ]
            })
          )

          await waitForVersion(organisationsRepository, org.id, org.version + 1)

          const response = await performLink(org.id, defraIdJwtToken)

          expect(response.statusCode).toBe(expectedStatusCode)
        }
      )

      it('organisation can be linked, unlinked, then re-linked', async () => {
        const userEmail = 'aUser@email.com'
        const defraIdToken = defraIdJwtTokenWith({ email: userEmail })
        const approvedOrg = await buildApprovedOrg(
          organisationsRepository,
          submitterContactDetails(userEmail)
        )

        const firstLinkResponse = await performLink(
          approvedOrg.id,
          defraIdToken
        )

        expect(firstLinkResponse.statusCode).toBe(StatusCodes.OK)

        const unlinkResponse = await performUnlink(approvedOrg.id)

        expect(unlinkResponse.statusCode).toBe(StatusCodes.NO_CONTENT)

        const secondLinkResponse = await performLink(
          approvedOrg.id,
          defraIdToken
        )

        expect(secondLinkResponse.statusCode).toBe(StatusCodes.OK)
      })

      it('rejects linking an organisation that is already linked', async () => {
        const userEmail = 'aUser@email.com'
        const defraIdToken = defraIdJwtTokenWith({ email: userEmail })
        const org = await buildApprovedOrg(
          organisationsRepository,
          submitterContactDetails(userEmail)
        )

        const firstLinkResponse = await performLink(org.id, defraIdToken)

        expect(firstLinkResponse.statusCode).toBe(StatusCodes.OK)

        await waitForVersion(organisationsRepository, org.id, org.version + 1)

        const secondLinkResponse = await performLink(org.id, defraIdToken)

        expect(secondLinkResponse.statusCode).toBe(StatusCodes.CONFLICT)
        expect(JSON.parse(secondLinkResponse.payload).message).toBe(
          'Organisation is not in a linkable state'
        )
      })

      it('only allows initial users to link the organisation', async () => {
        const user1Email = 'user1@email.com'
        const user2Email = 'user2@email.com'
        const defraIdOrganisationId = crypto.randomUUID()
        const user1DefraIdToken = defraIdJwtTokenWith({
          email: user1Email,
          defraIdOrganisationId
        })
        const user2DefraIdToken = defraIdJwtTokenWith({
          email: user2Email,
          defraIdOrganisationId
        })
        const org = await buildApprovedOrg(
          organisationsRepository,
          submitterContactDetails(user1Email)
        )

        const user1LinkResponse = await performLink(org.id, user1DefraIdToken)

        expect(user1LinkResponse.statusCode).toBe(StatusCodes.OK)

        // add user 2 to organisation
        const addUser2Response = await server.inject({
          method: 'PUT',
          url: `/v1/organisations/${org.id}/user`,
          headers: {
            Authorization: `Bearer ${user2DefraIdToken}`
          }
        })

        expect(addUser2Response.statusCode).toBe(StatusCodes.OK)

        await waitForVersion(organisationsRepository, org.id, org.version + 2)

        // read users
        const getOrganisationResponseUser1 = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${org.id}`,
          headers: {
            Authorization: `Bearer ${user1DefraIdToken}`
          }
        })

        const users = JSON.parse(getOrganisationResponseUser1.payload).users

        expect(users).toContainEqual(
          expect.objectContaining({
            email: user1Email,
            roles: ['initial_user', 'standard_user']
          })
        )

        expect(users).toContainEqual(
          expect.objectContaining({
            email: user2Email,
            roles: ['standard_user']
          })
        )

        // unlink
        const unlinkResponse = await performUnlink(org.id)

        expect(unlinkResponse.statusCode).toBe(StatusCodes.NO_CONTENT)

        // user 2 (not initial_user) attempts to link
        const user2LinkResponse = await performLink(org.id, user2DefraIdToken)

        expect(user2LinkResponse.statusCode).toBe(StatusCodes.CONFLICT)
      })

      describe('when the request succeeds', async () => {
        const defraIdContactId = crypto.randomUUID()
        const userEmail = 'aUser@email.com'
        const defraIdOrganisationId = crypto.randomUUID()
        const defraIdOrganisationName = 'Magic Ltd'

        const performPostLinkOrganisation = async () => {
          const defraIdToken = defraIdJwtTokenWith({
            defraIdContactId,
            email: userEmail,
            defraIdOrganisationId,
            defraIdOrganisationName
          })
          const org = await buildApprovedOrg(
            organisationsRepository,
            submitterContactDetails(userEmail)
          )

          const response = await performLink(org.id, defraIdToken)

          const finalOrgVersion = await waitForVersion(
            organisationsRepository,
            org.id,
            org.version + 1
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
              id: defraIdOrganisationId,
              name: defraIdOrganisationName,
              linkedAt: expect.stringMatching(ISO_DATE_STRING_REGEX),
              linkedBy: {
                email: userEmail,
                id: defraIdContactId
              }
            }
          })
        })

        it('leaves the organisation in the database with status: "active"', async () => {
          const { finalOrgVersion } = await performPostLinkOrganisation()

          expect(finalOrgVersion.status).toBe(ORGANISATION_STATUS.ACTIVE)
        })

        it('populates the organisation with a complete "linkedDefraOrganisation" object', async () => {
          const { response: linkResponse, finalOrgVersion } =
            await performPostLinkOrganisation()

          expect(linkResponse.statusCode).toBe(StatusCodes.OK)

          expect(finalOrgVersion.linkedDefraOrganisation).toEqual({
            orgId: defraIdOrganisationId,
            orgName: defraIdOrganisationName,
            linkedAt: expect.any(Date),
            linkedBy: {
              email: userEmail,
              id: defraIdContactId
            }
          })
        })

        it('captures a system log', async () => {
          const start = new Date()

          const { finalOrgVersion } = await performPostLinkOrganisation()

          const systemLogsResponse = await server.inject({
            method: 'GET',
            url: `/v1/system-logs/search?organisationId=${finalOrgVersion.id}`,
            ...asServiceMaintainer()
          })

          expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

          // System log
          const systemLogsResponseBody = JSON.parse(systemLogsResponse.payload)

          expect(systemLogsResponseBody.systemLogs).toHaveLength(1)
          const systemLogPayload = systemLogsResponseBody.systemLogs[0]

          expect(systemLogPayload.createdBy).toEqual({
            id: defraIdContactId,
            email: userEmail,
            scope: ['inquirer']
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
              id: defraIdOrganisationId,
              name: defraIdOrganisationName
            }
          })
        })

        it('captures an audit event', async () => {
          const { finalOrgVersion } = await performPostLinkOrganisation()

          expect(mockCdpAuditing).toHaveBeenCalledTimes(1)

          const auditPayload = mockCdpAuditing.mock.calls[0][0]

          expect(auditPayload.user).toEqual({
            id: defraIdContactId,
            email: userEmail,
            scope: ['inquirer']
          })

          expect(auditPayload.event).toEqual({
            category: 'entity',
            subCategory: 'epr-organisations',
            action: 'linked-to-defra-id-organisation'
          })

          expect(auditPayload.context).toEqual({
            organisationId: finalOrgVersion.id,
            linkedDefraOrganisation: {
              id: defraIdOrganisationId,
              name: defraIdOrganisationName
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
