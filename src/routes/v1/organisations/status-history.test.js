import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  REG_ACC_STATUS,
  ORGANISATION_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'
import { StatusCodes } from 'http-status-codes'

const { validToken } = entraIdMockAuthTokens
const { VALID_FROM, VALID_TO } = getValidDateRange()

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

describe('POST status-history routes', () => {
  setupAuthContext()
  let server
  let organisationsRepository

  beforeEach(async () => {
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

  const insertOrganisation = async () => {
    const fixture = buildOrganisation()
    await organisationsRepository.insert(fixture)
    return organisationsRepository.findById(fixture.id)
  }

  /**
   * Seeds an organisation whose first registration is APPROVED and linked to its
   * first (APPROVED) accreditation. The organisation itself stays `created`.
   */
  const seedApprovedRegAndAcc = async () => {
    const inserted = await insertOrganisation()

    const approvedRegistration = {
      ...inserted.registrations[0],
      status: REG_ACC_STATUS.APPROVED,
      registrationNumber: 'REG12345',
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      reprocessingType: REPROCESSING_TYPE.INPUT,
      accreditationId: inserted.accreditations[0].id
    }

    const approvedAccreditation = {
      ...inserted.accreditations[0],
      status: REG_ACC_STATUS.APPROVED,
      accreditationNumber: 'ACC12345',
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }

    await organisationsRepository.replace(
      inserted.id,
      1,
      prepareOrgUpdate(inserted, {
        registrations: [approvedRegistration],
        accreditations: [approvedAccreditation]
      })
    )

    return organisationsRepository.findById(inserted.id, 2)
  }

  const post = (url, payload) =>
    server.inject({
      method: 'POST',
      url,
      headers: { Authorization: `Bearer ${validToken}` },
      payload
    })

  const findSystemLog = async (organisationId) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/system-logs/search?organisationId=${organisationId}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })
    expect(response.statusCode).toBe(StatusCodes.OK)
    return JSON.parse(response.payload).systemLogs
  }

  it('organisation: appends the status, bumps the version, and logs the reason and previous status', async () => {
    const org = await seedApprovedRegAndAcc()

    const response = await post(`/v1/organisations/${org.id}/status-history`, {
      status: ORGANISATION_STATUS.APPROVED,
      reason: 'Documents verified',
      version: org.version
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body.status).toBe(ORGANISATION_STATUS.APPROVED)
    expect(body.version).toBe(org.version + 1)
    expect(body.statusHistory.at(-1).updatedBy).toBe('test-user-id')

    const logs = await findSystemLog(org.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].reason).toBe('Documents verified')
    expect(logs[0].event.action).toBe('status-transition')
    expect(logs[0].context.target).toEqual({ type: 'organisation' })
    expect(logs[0].context.previousStatus).toBe(ORGANISATION_STATUS.CREATED)
    expect(logs[0].context.nextStatus).toBe(ORGANISATION_STATUS.APPROVED)
    expect(logs[0].createdBy.id).toBe('test-user-id')
  })

  it('registration: appends the status to the targeted registration', async () => {
    const org = await insertOrganisation()
    const registrationId = org.registrations[0].id

    const response = await post(
      `/v1/organisations/${org.id}/registrations/${registrationId}/status-history`,
      {
        status: REG_ACC_STATUS.APPROVED,
        reason: 'Registration approved',
        version: org.version
      }
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    const registration = body.registrations.find((r) => r.id === registrationId)
    expect(registration.status).toBe(REG_ACC_STATUS.APPROVED)

    const logs = await findSystemLog(org.id)
    expect(logs[0].context.target).toEqual({
      type: 'registration',
      registrationId
    })
    expect(logs[0].context.previousStatus).toBe(REG_ACC_STATUS.CREATED)
    expect(logs[0].context.nextStatus).toBe(REG_ACC_STATUS.APPROVED)
  })

  it('accreditation: appends the status to the targeted accreditation', async () => {
    const org = await seedApprovedRegAndAcc()
    const registrationId = org.registrations[0].id
    const accreditationId = org.accreditations[0].id

    const response = await post(
      `/v1/organisations/${org.id}/registrations/${registrationId}/accreditations/${accreditationId}/status-history`,
      {
        status: REG_ACC_STATUS.SUSPENDED,
        reason: 'Accreditation suspended',
        version: org.version
      }
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    const accreditation = body.accreditations.find(
      (a) => a.id === accreditationId
    )
    expect(accreditation.status).toBe(REG_ACC_STATUS.SUSPENDED)

    const logs = await findSystemLog(org.id)
    expect(logs[0].context.target).toEqual({
      type: 'accreditation',
      accreditationId
    })
    expect(logs[0].context.previousStatus).toBe(REG_ACC_STATUS.APPROVED)
  })

  it('rejects a payload missing the reason with 400', async () => {
    const org = await insertOrganisation()

    const response = await post(`/v1/organisations/${org.id}/status-history`, {
      status: ORGANISATION_STATUS.APPROVED,
      version: org.version
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
  })

  it('returns 409 when the version does not match', async () => {
    const org = await seedApprovedRegAndAcc()

    const response = await post(`/v1/organisations/${org.id}/status-history`, {
      status: ORGANISATION_STATUS.APPROVED,
      reason: 'Documents verified',
      version: org.version + 1
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
  })

  it('returns 422 for an invalid organisation transition', async () => {
    const org = await insertOrganisation()

    const response = await post(`/v1/organisations/${org.id}/status-history`, {
      status: ORGANISATION_STATUS.ACTIVE,
      reason: 'Attempt to activate directly',
      version: org.version
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })
})
