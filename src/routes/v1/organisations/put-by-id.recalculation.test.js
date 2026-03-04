import {
  buildOrganisation,
  prepareOrgUpdate,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { StatusCodes } from 'http-status-codes'
import {
  REG_ACC_STATUS,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'

const { validToken } = entraIdMockAuthTokens

vi.mock('@defra/cdp-auditing', () => ({
  audit: vi.fn()
}))

const { VALID_FROM, VALID_TO } = getValidDateRange()

describe('PUT /v1/organisations/{id} — waste balance recalculation', () => {
  setupAuthContext()

  let server
  let organisationsRepository
  let wasteRecordsRepository
  let wasteBalancesRepository
  let updateWasteBalanceTransactionsSpy

  beforeEach(async () => {
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()

    const wasteRecordsRepositoryFactory = createInMemoryWasteRecordsRepository()
    wasteRecordsRepository = wasteRecordsRepositoryFactory()

    const wasteBalancesRepositoryFactory =
      createInMemoryWasteBalancesRepository([], { organisationsRepository })
    wasteBalancesRepository = wasteBalancesRepositoryFactory()
    updateWasteBalanceTransactionsSpy = vi.spyOn(
      wasteBalancesRepository,
      'updateWasteBalanceTransactions'
    )

    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        systemLogsRepository: createSystemLogsRepository(),
        wasteRecordsRepository: () => wasteRecordsRepository,
        wasteBalancesRepository: () => wasteBalancesRepository
      },
      featureFlags
    })
  })

  /**
   * Sets up an organisation with an approved registration and accreditation,
   * then returns the approved state for further testing.
   */
  const setupApprovedOrg = async () => {
    const orgData = buildOrganisation()
    await organisationsRepository.insert(orgData)
    const inserted = await organisationsRepository.findById(orgData.id)

    const registration = inserted.registrations[0]
    const accreditation = inserted.accreditations[0]

    const approvedReg = {
      ...registration,
      status: REG_ACC_STATUS.APPROVED,
      registrationNumber: 'REG-1',
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      reprocessingType: REPROCESSING_TYPE.INPUT,
      accreditationId: accreditation.id
    }

    const approvedAcc = {
      ...accreditation,
      status: REG_ACC_STATUS.APPROVED,
      accreditationNumber: 'ACC-1',
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }

    await organisationsRepository.replace(
      orgData.id,
      1,
      prepareOrgUpdate(inserted, {
        registrations: [approvedReg],
        accreditations: [approvedAcc]
      })
    )

    const approved = await organisationsRepository.findById(orgData.id, 2)
    return { orgId: orgData.id, approved }
  }

  /**
   * Seeds a minimal waste record for a given registration.
   */
  const seedWasteRecord = async (orgId, registrationId) => {
    const wasteRecordVersions = new Map()
    wasteRecordVersions.set(
      'received',
      new Map([
        [
          '1001',
          {
            data: {
              processingType: 'REPROCESSOR_INPUT',
              ROW_ID: 1001,
              DATE_RECEIVED_FOR_REPROCESSING: VALID_FROM,
              TONNAGE_RECEIVED_FOR_RECYCLING: 500,
              WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No'
            },
            version: {
              id: 'v1',
              summaryLog: { id: 'sl-1', uri: 's3://bucket/key' },
              createdAt: new Date().toISOString()
            }
          }
        ]
      ])
    )

    await wasteRecordsRepository.appendVersions(
      orgId,
      registrationId,
      wasteRecordVersions
    )
  }

  const injectPut = (orgId, version, updateFragment) =>
    server.inject({
      method: 'PUT',
      url: `/v1/organisations/${orgId}`,
      headers: { Authorization: `Bearer ${validToken}` },
      payload: { version, updateFragment }
    })

  it('triggers recalculation when accreditation status changes', async () => {
    const { orgId, approved } = await setupApprovedOrg()
    const accreditationId = approved.accreditations[0].id
    const registrationId = approved.registrations[0].id

    await seedWasteRecord(orgId, registrationId)

    // Suspend the accreditation via the PUT endpoint
    const suspendedAcc = {
      ...approved.accreditations[0],
      status: REG_ACC_STATUS.SUSPENDED
    }

    const updateFragment = prepareOrgUpdate(approved, {
      accreditations: [suspendedAcc]
    })

    const response = await injectPut(orgId, approved.version, updateFragment)
    expect(response.statusCode).toBe(StatusCodes.OK)

    const body = JSON.parse(response.payload)
    const updatedAcc = body.accreditations.find((a) => a.id === accreditationId)
    expect(updatedAcc.status).toBe(REG_ACC_STATUS.SUSPENDED)

    // Verify recalculation was triggered
    expect(updateWasteBalanceTransactionsSpy).toHaveBeenCalledWith(
      expect.any(Array),
      accreditationId,
      expect.objectContaining({ id: 'test-user-id' })
    )
  })

  it('does not trigger recalculation when accreditation status stays the same', async () => {
    const { orgId, approved } = await setupApprovedOrg()
    const registrationId = approved.registrations[0].id

    await seedWasteRecord(orgId, registrationId)

    // Update without changing accreditation status
    const updateFragment = prepareOrgUpdate(approved, {
      wasteProcessingTypes: ['reprocessor']
    })

    const response = await injectPut(orgId, approved.version, updateFragment)
    expect(response.statusCode).toBe(StatusCodes.OK)

    expect(updateWasteBalanceTransactionsSpy).not.toHaveBeenCalled()
  })

  it('still returns the updated organisation when there are no waste records to recalculate', async () => {
    const { orgId, approved } = await setupApprovedOrg()
    const accreditationId = approved.accreditations[0].id

    // Suspend accreditation with no waste records seeded
    const suspendedAcc = {
      ...approved.accreditations[0],
      status: REG_ACC_STATUS.SUSPENDED
    }

    const updateFragment = prepareOrgUpdate(approved, {
      accreditations: [suspendedAcc]
    })

    const response = await injectPut(orgId, approved.version, updateFragment)
    expect(response.statusCode).toBe(StatusCodes.OK)

    const body = JSON.parse(response.payload)
    const updatedAcc = body.accreditations.find((a) => a.id === accreditationId)
    expect(updatedAcc.status).toBe(REG_ACC_STATUS.SUSPENDED)

    // No waste records means no recalculation was triggered
    expect(updateWasteBalanceTransactionsSpy).not.toHaveBeenCalled()
  })
})
