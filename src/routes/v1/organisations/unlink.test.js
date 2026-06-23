import { SCOPES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildLinkedDefraOrg,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  asServiceMaintainerRead,
  asServiceMaintainerWrite,
  asSupport,
  asUnscopedAdminUser
} from '#test/inject-auth.js'
import { buildApprovedOrg } from '#vite/helpers/build-approved-org.js'
import {
  COMPANY_1_ID,
  COMPANY_1_NAME
} from '#vite/helpers/create-defra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'

const mockCdpAuditing = vi.fn()
const mockOrganisationUnlinkedMetric = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (/** @type {any} */ ...args) => mockCdpAuditing(...args)
}))

vi.mock(
  import('#common/helpers/metrics/organisation-linking.js'),
  async (importOriginal) => {
    const actual = await importOriginal()
    return {
      ...actual,
      organisationLinkingMetrics: {
        ...actual.organisationLinkingMetrics,
        organisationUnlinked: () => mockOrganisationUnlinkedMetric()
      }
    }
  }
)

// The audit/system-log identity is the admin credential injected below.
const ADMIN_USER = {
  id: 'test-maintainer-id',
  email: 'maintainer@example.com',
  scope: [SCOPES.adminRead, SCOPES.adminWrite, SCOPES.adminDlqPurge]
}

describe('DELETE /v1/organisations/{organisationId}/link', () => {
  setupAuthContext()
  /** @type {import('#test/create-test-server.js').TestServer} */
  let server
  /** @type {import('#repositories/organisations/port.js').OrganisationsRepository} */
  let organisationsRepository

  beforeAll(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags()

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

  describe('access control', () => {
    const unlinkUrl = `/v1/organisations/${buildOrganisation().id}/link`

    it('returns 401 when the request is not authenticated', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: unlinkUrl
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an authenticated user with no admin tier', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: unlinkUrl,
        ...asUnscopedAdminUser()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 403 for the support tier (admin.read only)', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: unlinkUrl,
        ...asSupport()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 403 for the maintainer tier without admin.write', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: unlinkUrl,
        ...asServiceMaintainerRead()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('the requester has admin write scope', () => {
    it('returns 404 when the organisation does not exist', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/organisations/${buildOrganisation().id}/link`,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 409 when the organisation is not linked', async () => {
      const org = await buildApprovedOrg(organisationsRepository)

      const response = await server.inject({
        method: 'DELETE',
        url: `/v1/organisations/${org.id}/link`,
        ...asServiceMaintainerWrite()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    describe('when the request succeeds', () => {
      const performUnlink = async () => {
        const org = await buildApprovedOrg(organisationsRepository, {
          linkedDefraOrganisation: buildLinkedDefraOrg(
            COMPANY_1_ID,
            COMPANY_1_NAME
          )
        })

        const response = await server.inject({
          method: 'DELETE',
          url: `/v1/organisations/${org.id}/link`,
          ...asServiceMaintainerWrite()
        })

        // buildApprovedOrg leaves the org at version 2; the unlink replace
        // bumps it to version 3.
        const unlinkedOrg = await waitForVersion(
          organisationsRepository,
          org.id,
          3
        )

        return { response, unlinkedOrg }
      }

      it('returns 204 status code', async () => {
        const { response } = await performUnlink()

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
      })

      it('removes the linked Defra organisation without changing the status', async () => {
        const { unlinkedOrg } = await performUnlink()

        expect(unlinkedOrg.linkedDefraOrganisation).toBeUndefined()
        expect(unlinkedOrg.status).toBe(ORGANISATION_STATUS.APPROVED)
      })

      it('captures a system log', async () => {
        const start = new Date()

        const { unlinkedOrg } = await performUnlink()

        const systemLogsResponse = await server.inject({
          method: 'GET',
          url: `/v1/system-logs/search?organisationId=${unlinkedOrg.id}`,
          ...asServiceMaintainerWrite()
        })

        expect(systemLogsResponse.statusCode).toBe(StatusCodes.OK)

        const systemLogsResponseBody = JSON.parse(systemLogsResponse.payload)

        expect(systemLogsResponseBody.systemLogs).toHaveLength(1)
        const systemLogPayload = systemLogsResponseBody.systemLogs[0]

        expect(systemLogPayload.createdBy).toEqual(ADMIN_USER)

        expect(
          new Date(systemLogPayload.createdAt).getTime()
        ).toBeGreaterThanOrEqual(start.getTime())

        expect(systemLogPayload.event).toEqual({
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'unlinked-from-defra-id-organisation'
        })

        expect(systemLogPayload.context).toEqual({
          organisationId: unlinkedOrg.id,
          unlinkedDefraOrganisation: {
            id: COMPANY_1_ID,
            name: COMPANY_1_NAME
          }
        })
      })

      it('captures an audit event', async () => {
        const { unlinkedOrg } = await performUnlink()

        expect(mockCdpAuditing).toHaveBeenCalledTimes(1)

        const auditPayload = mockCdpAuditing.mock.calls[0][0]

        expect(auditPayload.user).toEqual(ADMIN_USER)

        expect(auditPayload.event).toEqual({
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'unlinked-from-defra-id-organisation'
        })

        expect(auditPayload.context).toEqual({
          organisationId: unlinkedOrg.id,
          unlinkedDefraOrganisation: {
            id: COMPANY_1_ID,
            name: COMPANY_1_NAME
          }
        })
      })

      it('captures a metric', async () => {
        await performUnlink()

        expect(mockOrganisationUnlinkedMetric).toHaveBeenCalledTimes(1)
      })
    })
  })
})
