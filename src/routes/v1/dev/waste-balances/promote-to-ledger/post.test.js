import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import {
  buildOrganisation,
  buildRegistration,
  buildAccreditation,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { buildWasteRecord } from '#repositories/waste-records/contract/test-data.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

/** @import {WasteBalance} from '#waste-balances/domain/model.js' */

/**
 * @typedef {{
 *   featureFlagOverrides?: Record<string, boolean>
 *   organisations?: object[]
 *   prns?: object[]
 *   wasteRecords?: object[]
 *   wasteBalances?: Partial<WasteBalance>[]
 *   summaryLogs?: { id: string, summaryLog: object }[]
 * }} SetupServerOptions
 */

describe('POST /v1/dev/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/promote-to-ledger', () => {
  setupAuthContext()

  const { VALID_FROM, VALID_TO } = getValidDateRange()

  /**
   * Build a realistic test scenario: an accreditation that has received a
   * summary-log submission (crediting 200 tonnes) followed by a PRN issuance
   * (debiting 50 tonnes), giving a net positive balance. This ensures the
   * migrated event history is non-empty and realistic.
   */
  function buildTestData() {
    const accreditationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const summaryLogFileId = `file-${randomUUID()}`

    const accreditation = buildAccreditation({
      id: accreditationId,
      wasteProcessingType: 'reprocessor',
      material: 'plastic',
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      statusHistory: [
        { status: 'created', updatedAt: new Date('2025-01-01') },
        { status: 'approved', updatedAt: new Date('2025-02-01') }
      ]
    })

    const registration = buildRegistration({
      id: registrationId,
      accreditationId,
      wasteProcessingType: 'reprocessor',
      material: 'plastic',
      statusHistory: [
        { status: 'created', updatedAt: new Date('2025-01-01') },
        { status: 'approved', updatedAt: new Date('2025-02-01') }
      ]
    })

    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })

    const summaryLog = summaryLogFactory.submitted({
      organisationId: organisation.id,
      registrationId,
      submittedAt: '2025-06-15T10:00:00.000Z',
      file: { id: summaryLogFileId }
    })

    const wasteRecord = buildWasteRecord({
      organisationId: organisation.id,
      registrationId,
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        processingType: 'REPROCESSOR_INPUT',
        ROW_ID: 'R001',
        DATE_RECEIVED_FOR_REPROCESSING: VALID_FROM,
        EWC_CODE: '02 01 04',
        DESCRIPTION_WASTE: 'Plastic packaging waste',
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
        GROSS_WEIGHT: 220,
        TARE_WEIGHT: 10,
        PALLET_WEIGHT: 5,
        NET_WEIGHT: 205,
        BAILING_WIRE_PROTOCOL: 'No',
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Visual assessment',
        WEIGHT_OF_NON_TARGET_MATERIALS: 5,
        RECYCLABLE_PROPORTION_PERCENTAGE: 100,
        TONNAGE_RECEIVED_FOR_RECYCLING: 200
      },
      versions: [
        {
          id: randomUUID(),
          createdAt: '2025-06-15T10:00:00.000Z',
          status: 'created',
          summaryLog: { id: summaryLogFileId, uri: 's3://bucket/key' },
          data: {
            processingType: 'REPROCESSOR_INPUT',
            ROW_ID: 'R001',
            DATE_RECEIVED_FOR_REPROCESSING: VALID_FROM,
            EWC_CODE: '02 01 04',
            DESCRIPTION_WASTE: 'Plastic packaging waste',
            WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
            GROSS_WEIGHT: 220,
            TARE_WEIGHT: 10,
            PALLET_WEIGHT: 5,
            NET_WEIGHT: 205,
            BAILING_WIRE_PROTOCOL: 'No',
            HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Visual assessment',
            WEIGHT_OF_NON_TARGET_MATERIALS: 5,
            RECYCLABLE_PROPORTION_PERCENTAGE: 100,
            TONNAGE_RECEIVED_FOR_RECYCLING: 200
          }
        }
      ]
    })

    const prn = {
      ...buildAwaitingAcceptancePrn({
        organisation: {
          id: String(organisation.orgId),
          name: 'Test Organisation',
          tradingName: 'Test Organisation'
        },
        registrationId,
        accreditation: {
          id: accreditationId,
          accreditationNumber: `ACC-${accreditationId}`,
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
        },
        tonnage: 50
      }),
      id: new ObjectId().toHexString()
    }

    // Note: registrationId is intentionally absent — production waste balance
    // documents never have it (see createNewWasteBalance).
    /** @type {Partial<WasteBalance>} */
    const wasteBalance = {
      id: new ObjectId().toString(),
      organisationId: organisation.id,
      accreditationId,
      schemaVersion: 1,
      version: 1,
      amount: 200,
      availableAmount: 150,
      transactions: [],
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
    }

    return {
      organisation,
      accreditationId,
      registrationId,
      summaryLog,
      summaryLogFileId,
      wasteRecord,
      prn,
      wasteBalance
    }
  }

  /**
   * @param {string} organisationId
   * @param {string} registrationId
   * @param {string} accreditationId
   */
  function url(organisationId, registrationId, accreditationId) {
    return `/v1/dev/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/promote-to-ledger`
  }

  /** @param {SetupServerOptions} [options] */
  async function setupServer({
    featureFlagOverrides = {},
    organisations = [],
    prns = [],
    wasteRecords = [],
    wasteBalances = [],
    summaryLogs = []
  } = {}) {
    const featureFlags = createInMemoryFeatureFlags({
      devEndpoints: true,
      ...featureFlagOverrides
    })

    const organisationsFactory =
      createInMemoryOrganisationsRepository(organisations)
    const prnFactory = createInMemoryPackagingRecyclingNotesRepository(prns)
    const wasteRecordsFactory =
      createInMemoryWasteRecordsRepository(wasteRecords)

    const server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsFactory,
        packagingRecyclingNotesRepository: prnFactory,
        wasteRecordsRepository: wasteRecordsFactory
      },
      featureFlags
    })

    // Seed waste balances into the in-memory store
    const wbRepo = /** @type {any} */ (server.app.wasteBalancesRepository)
    wbRepo._getStorageForTesting().push(...wasteBalances)

    const slRepo = /** @type {any} */ (server.app.summaryLogsRepository)
    for (const { id, summaryLog } of summaryLogs) {
      await slRepo.insert(id, summaryLog)
    }

    return server
  }

  describe('feature flag disabled', () => {
    it('should return 404 when devEndpoints feature flag is disabled', async () => {
      const server = await setupServer({
        featureFlagOverrides: { devEndpoints: false }
      })

      const response = await server.inject({
        method: 'POST',
        url: url('org-1', 'reg-1', 'acc-1')
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('validation', () => {
    it('should return 422 when accreditationId is empty', async () => {
      const server = await setupServer()

      const response = await server.inject({
        method: 'POST',
        url: url('org-1', 'reg-1', '%20')
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('not found', () => {
    it('should return 404 when no waste balance exists for the accreditation', async () => {
      const server = await setupServer()

      const response = await server.inject({
        method: 'POST',
        url: url('org-1', 'reg-1', 'nonexistent')
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('idempotency', () => {
    it('should return 200 with already-promoted when balance is already ledger', async () => {
      const { organisation, accreditationId, registrationId, wasteBalance } =
        buildTestData()
      wasteBalance.canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.LEDGER

      const server = await setupServer({
        organisations: [organisation],
        wasteBalances: [wasteBalance]
      })

      const response = await server.inject({
        method: 'POST',
        url: url(organisation.id, registrationId, accreditationId)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.result).toBe('already-promoted')
    })
  })

  describe('promotion failure', () => {
    it('should return 500 when promotion is skipped due to version conflict', async () => {
      const {
        organisation,
        accreditationId,
        registrationId,
        summaryLog,
        summaryLogFileId,
        wasteRecord,
        prn,
        wasteBalance
      } = buildTestData()

      const server = await setupServer({
        organisations: [organisation],
        prns: [prn],
        wasteRecords: [wasteRecord],
        wasteBalances: [wasteBalance],
        summaryLogs: [{ id: summaryLogFileId, summaryLog }]
      })

      // Simulate a version conflict by bumping the balance version
      // after the handler reads it but before promoteAccreditation flips
      const repo = /** @type {any} */ (server.app.wasteBalancesRepository)
      const storage = repo._getStorageForTesting()
      const original = storage.find(
        (/** @type {any} */ wb) => wb.accreditationId === accreditationId
      )

      const originalFlip = repo.flipCanonicalSourceToMigrating
      vi.spyOn(repo, 'flipCanonicalSourceToMigrating').mockImplementation(
        async (/** @type {any} */ params) => {
          original.version += 1
          return originalFlip(params)
        }
      )

      const response = await server.inject({
        method: 'POST',
        url: url(organisation.id, registrationId, accreditationId)
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })

  describe('happy path', () => {
    it('should promote a zero-balance accreditation with no event history', async () => {
      const { organisation, accreditationId, registrationId, wasteBalance } =
        buildTestData()
      wasteBalance.amount = 0
      wasteBalance.availableAmount = 0

      const server = await setupServer({
        organisations: [organisation],
        wasteBalances: [wasteBalance]
      })

      const response = await server.inject({
        method: 'POST',
        url: url(organisation.id, registrationId, accreditationId)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.result).toBe('promoted')
      expect(body.eventCount).toBe(0)
    })

    it('should promote an embedded balance to ledger with non-empty event history', async () => {
      const {
        organisation,
        accreditationId,
        registrationId,
        summaryLog,
        summaryLogFileId,
        wasteRecord,
        prn,
        wasteBalance
      } = buildTestData()

      const server = await setupServer({
        organisations: [organisation],
        prns: [prn],
        wasteRecords: [wasteRecord],
        wasteBalances: [wasteBalance],
        summaryLogs: [{ id: summaryLogFileId, summaryLog }]
      })

      const response = await server.inject({
        method: 'POST',
        url: url(organisation.id, registrationId, accreditationId)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.result).toBe('promoted')
      expect(body.eventCount).toBeGreaterThanOrEqual(3)

      const updatedBalance = await /** @type {any} */ (
        server.app.wasteBalancesRepository
      ).findByAccreditationId(accreditationId)
      expect(updatedBalance.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      )
    })

    it('should not require authentication', async () => {
      const {
        organisation,
        accreditationId,
        registrationId,
        summaryLog,
        summaryLogFileId,
        wasteRecord,
        prn,
        wasteBalance
      } = buildTestData()

      const server = await setupServer({
        organisations: [organisation],
        prns: [prn],
        wasteRecords: [wasteRecord],
        wasteBalances: [wasteBalance],
        summaryLogs: [{ id: summaryLogFileId, summaryLog }]
      })

      const response = await server.inject({
        method: 'POST',
        url: url(organisation.id, registrationId, accreditationId)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('should recover a stuck migrating balance before promoting', async () => {
      const {
        organisation,
        accreditationId,
        registrationId,
        summaryLog,
        summaryLogFileId,
        wasteRecord,
        prn,
        wasteBalance
      } = buildTestData()
      wasteBalance.canonicalSource = WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      wasteBalance.migratingSince = new Date().toISOString()

      const server = await setupServer({
        organisations: [organisation],
        prns: [prn],
        wasteRecords: [wasteRecord],
        wasteBalances: [wasteBalance],
        summaryLogs: [{ id: summaryLogFileId, summaryLog }]
      })

      const response = await server.inject({
        method: 'POST',
        url: url(organisation.id, registrationId, accreditationId)
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.result).toBe('promoted')

      const updatedBalance = await /** @type {any} */ (
        server.app.wasteBalancesRepository
      ).findByAccreditationId(accreditationId)
      expect(updatedBalance.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
      )
    })
  })
})
