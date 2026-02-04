import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'
import {
  MATERIAL,
  NATION,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation
} from './integration-test-helpers.js'

/**
 * Integration tests for waste balance arithmetic across multiple operations.
 *
 * Tests verify that waste balance calculations remain correct when performing
 * a series of credits (from summary log submissions) and debits (from PRN creation).
 *
 * Per PAE-1003: available balance = total credits - PRN deductions
 */
describe('Waste balance arithmetic integration tests', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  const sharedMeta = {
    REGISTRATION_NUMBER: {
      value: 'REG-12345',
      location: { sheet: 'Data', row: 1, column: 'B' }
    },
    PROCESSING_TYPE: {
      value: 'EXPORTER',
      location: { sheet: 'Data', row: 2, column: 'B' }
    },
    MATERIAL: {
      value: 'Paper_and_board',
      location: { sheet: 'Data', row: 3, column: 'B' }
    },
    TEMPLATE_VERSION: {
      value: 5,
      location: { sheet: 'Data', row: 4, column: 'B' }
    },
    ACCREDITATION_NUMBER: {
      value: 'ACC-2025-001',
      location: { sheet: 'Data', row: 5, column: 'B' }
    }
  }

  const sharedHeaders = [
    'ROW_ID',
    'DATE_RECEIVED_FOR_EXPORT',
    'EWC_CODE',
    'DESCRIPTION_WASTE',
    'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
    'GROSS_WEIGHT',
    'TARE_WEIGHT',
    'PALLET_WEIGHT',
    'NET_WEIGHT',
    'BAILING_WIRE_PROTOCOL',
    'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
    'WEIGHT_OF_NON_TARGET_MATERIALS',
    'RECYCLABLE_PROPORTION_PERCENTAGE',
    'TONNAGE_RECEIVED_FOR_EXPORT',
    'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
    'INTERIM_SITE_ID',
    'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
    'DATE_RECEIVED_BY_OSR',
    'OSR_ID',
    'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
    'DATE_OF_EXPORT',
    'EXPORT_CONTROLS',
    'BASEL_EXPORT_CODE',
    'CUSTOMS_CODES',
    'CONTAINER_NUMBER'
  ]

  const createRowValues = (overrides = {}) => {
    const defaults = {
      rowId: 1001,
      dateReceived: '2025-01-15T00:00:00.000Z',
      ewcCode: '03 03 08',
      wasteDescription: 'Glass - pre-sorted',
      prnIssued: 'No',
      grossWeight: 1000,
      tareWeight: 100,
      palletWeight: 50,
      netWeight: 850,
      bailingWire: 'No',
      recyclablePropMethod: 'Actual weight (100%)',
      nonTargetWeight: 0,
      recyclablePropPct: 1,
      tonnageReceived: 850,
      interimSite: 'No',
      interimSiteId: 100,
      interimTonnage: 0,
      dateReceivedByOsr: '2025-01-18T00:00:00.000Z',
      osrId: 100,
      exportTonnage: 100,
      exportDate: '2025-01-20T00:00:00.000Z',
      exportControls: 'Article 18 (Green list)',
      baselCode: 'B3020',
      customsCode: '123456',
      containerNumber: 'CONT123456'
    }
    const d = { ...defaults, ...overrides }
    return [
      d.rowId,
      d.dateReceived,
      d.ewcCode,
      d.wasteDescription,
      d.prnIssued,
      d.grossWeight,
      d.tareWeight,
      d.palletWeight,
      d.netWeight,
      d.bailingWire,
      d.recyclablePropMethod,
      d.nonTargetWeight,
      d.recyclablePropPct,
      d.tonnageReceived,
      d.interimSite,
      d.interimSiteId,
      d.interimTonnage,
      d.dateReceivedByOsr,
      d.osrId,
      d.exportTonnage,
      d.exportDate,
      d.exportControls,
      d.baselCode,
      d.customsCode,
      d.containerNumber
    ]
  }

  const createUploadData = (rows) => ({
    RECEIVED_LOADS_FOR_EXPORT: {
      location: { sheet: 'Received', row: 7, column: 'A' },
      headers: sharedHeaders,
      rows: rows.map((row, index) => ({
        rowNumber: 8 + index,
        values: createRowValues(row)
      }))
    }
  })

  const setupIntegrationEnvironment = async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn()
    }
    const uploadsRepository = createInMemoryUploadsRepository()
    const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

    // Generate IDs inside setup to ensure consistency
    const organisationId = new ObjectId().toString()
    const registrationId = new ObjectId().toString()
    const accreditationId = new ObjectId().toString()

    const testOrg = buildOrganisation({
      registrations: [
        {
          id: registrationId,
          registrationNumber: 'REG-12345',
          status: 'approved',
          material: 'paper',
          wasteProcessingType: 'exporter',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'ea',
          validFrom: '2025-01-01',
          validTo: '2025-12-31',
          accreditationId
        }
      ],
      accreditations: [
        {
          id: accreditationId,
          accreditationNumber: 'ACC-2025-001',
          validFrom: '2025-01-01',
          validTo: '2025-12-31'
        }
      ]
    })
    testOrg.id = organisationId

    const organisationsRepository = createInMemoryOrganisationsRepository([
      testOrg
    ])()

    const wasteRecordsRepositoryFactory = createInMemoryWasteRecordsRepository()
    const wasteRecordsRepository = wasteRecordsRepositoryFactory()

    const wasteBalancesRepositoryFactory =
      createInMemoryWasteBalancesRepository([], { organisationsRepository })
    const wasteBalancesRepository = wasteBalancesRepositoryFactory()

    // Dynamic extractor for file data
    const fileDataMap = {}
    const dynamicExtractor = {
      extract: async (summaryLog) => {
        const fileId = summaryLog.file.id
        if (!fileDataMap[fileId]) {
          throw new Error(`No data found for file ${fileId}`)
        }
        return fileDataMap[fileId]
      }
    }

    const validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      summaryLogExtractor: dynamicExtractor
    })

    const featureFlags = createInMemoryFeatureFlags({
      summaryLogs: true,
      lumpyPackagingRecyclingNotes: true
    })

    const syncWasteRecords = syncFromSummaryLog({
      extractor: dynamicExtractor,
      wasteRecordRepository: wasteRecordsRepository,
      wasteBalancesRepository,
      organisationsRepository
    })

    const submitterWorker = {
      validate: validateSummaryLog,
      submit: async (summaryLogId) => {
        await new Promise((resolve) => setImmediate(resolve))

        const existing = await summaryLogsRepository.findById(summaryLogId)
        const { version, summaryLog } = existing

        await syncWasteRecords(summaryLog)

        await summaryLogsRepository.update(
          summaryLogId,
          version,
          transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
        )
      }
    }

    // PRN repository
    const prnStorage = new Map()
    const lumpyPackagingRecyclingNotesRepository = {
      create: async (prn) => {
        const id = new ObjectId().toHexString()
        const prnWithId = { ...prn, id }
        prnStorage.set(id, structuredClone(prnWithId))
        return structuredClone(prnWithId)
      },
      findById: async (id) => {
        const prn = prnStorage.get(id)
        return prn ? structuredClone(prn) : null
      },
      updateStatus: async ({ id, status, updatedBy, updatedAt, prnNumber }) => {
        const prn = prnStorage.get(id)
        if (!prn) return null

        const updated = {
          ...prn,
          status: {
            currentStatus: status,
            history: [
              ...(prn.status?.history ?? []),
              { status, updatedAt, updatedBy }
            ]
          },
          updatedBy,
          updatedAt,
          ...(prnNumber && { prnNumber })
        }
        prnStorage.set(id, updated)
        return structuredClone(updated)
      },
      findByAccreditation: async (accId) => {
        const results = []
        for (const prn of prnStorage.values()) {
          if (prn.issuedByAccreditation === accId) {
            results.push(structuredClone(prn))
          }
        }
        return results
      }
    }

    const server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        uploadsRepository,
        wasteRecordsRepository: wasteRecordsRepositoryFactory,
        organisationsRepository: () => organisationsRepository,
        wasteBalancesRepository: wasteBalancesRepositoryFactory,
        lumpyPackagingRecyclingNotesRepository: () =>
          lumpyPackagingRecyclingNotesRepository
      },
      workers: {
        summaryLogsWorker: submitterWorker
      },
      featureFlags
    })

    return {
      server,
      wasteBalancesRepository,
      lumpyPackagingRecyclingNotesRepository,
      fileDataMap,
      organisationId,
      registrationId,
      accreditationId
    }
  }

  const uploadAndValidate = async (
    env,
    summaryLogId,
    fileId,
    filename,
    uploadData
  ) => {
    const { server, fileDataMap, organisationId, registrationId } = env

    fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

    await server.inject({
      method: 'POST',
      url: buildPostUrl(organisationId, registrationId, summaryLogId),
      payload: createUploadPayload(
        organisationId,
        registrationId,
        UPLOAD_STATUS.COMPLETE,
        fileId,
        filename
      )
    })

    await pollForValidation(
      server,
      organisationId,
      registrationId,
      summaryLogId
    )

    return server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })
  }

  const submitAndPoll = async (env, summaryLogId) => {
    const { server, organisationId, registrationId } = env

    await server.inject({
      method: 'POST',
      url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    let attempts = 0
    const maxAttempts = 10
    let status = SUMMARY_LOG_STATUS.SUBMITTING

    while (status === SUMMARY_LOG_STATUS.SUBMITTING && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 50))

      const checkResponse = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      status = JSON.parse(checkResponse.payload).status
      attempts++
    }
    return status
  }

  const performSummaryLogSubmission = async (
    env,
    summaryLogId,
    fileId,
    filename,
    uploadData
  ) => {
    await uploadAndValidate(env, summaryLogId, fileId, filename, uploadData)
    await submitAndPoll(env, summaryLogId)
  }

  const createPrn = async (env, tonnage) => {
    const { server, organisationId, registrationId, accreditationId } = env

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes`,
      ...asStandardUser({ linkedOrgId: organisationId }),
      payload: {
        issuedToOrganisation: 'producer-org-123',
        tonnage,
        material: MATERIAL.PAPER,
        nation: NATION.ENGLAND,
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
      }
    })

    return JSON.parse(response.payload)
  }

  const transitionPrnStatus = async (env, prnId, status) => {
    const { server, organisationId, registrationId, accreditationId } = env

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}/status`,
      ...asStandardUser({ linkedOrgId: organisationId }),
      payload: { status }
    })

    return JSON.parse(response.payload)
  }

  describe('series of credits and debits', () => {
    it('should maintain correct balance through multiple summary log submissions and PRN creations', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Step 1: Submit first summary log with 100 + 200 = 300 tonnes
      await performSummaryLogSubmission(
        env,
        'log-1',
        'file-1',
        'waste-1.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 1002, exportTonnage: 200 }
        ])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      // Step 2: Create PRN for 50 tonnes and raise it (deduct from available)
      const prn1 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(300) // Total unchanged
      expect(balance.availableAmount).toBeCloseTo(250) // 300 - 50 = 250

      // Step 3: Submit revised summary log with additional row (all rows included)
      // Summary logs represent complete snapshots, so include all rows
      await performSummaryLogSubmission(
        env,
        'log-2',
        'file-2',
        'waste-2.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 1002, exportTonnage: 200 },
          { rowId: 2001, exportTonnage: 150 }
        ])
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(450) // 100 + 200 + 150 = 450
      expect(balance.availableAmount).toBeCloseTo(400) // 450 - 50 = 400

      // Step 4: Create another PRN for 75 tonnes
      const prn2 = await createPrn(env, 75)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(450) // Total unchanged
      expect(balance.availableAmount).toBeCloseTo(325) // 400 - 75 = 325

      // Step 5: Create a third PRN for 100 tonnes
      const prn3 = await createPrn(env, 100)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(450) // Total unchanged
      expect(balance.availableAmount).toBeCloseTo(225) // 325 - 100 = 225
    })

    it('should handle interleaved credits and debits correctly', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Interleave summary log submissions and PRN creations
      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-a',
        'file-a',
        'waste-a.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(100)

      // Debit: 30
      const prn1 = await createPrn(env, 30)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(70)

      // Credit: 50 (include previous row 1001 in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-b',
        'file-b',
        'waste-b.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 2001, exportTonnage: 50 }
        ])
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(150)
      expect(balance.availableAmount).toBeCloseTo(120)

      // Debit: 45
      const prn2 = await createPrn(env, 45)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(150)
      expect(balance.availableAmount).toBeCloseTo(75)

      // Credit: 200 (include all previous rows in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-c',
        'file-c',
        'waste-c.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 2001, exportTonnage: 50 },
          { rowId: 3001, exportTonnage: 200 }
        ])
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(350)
      expect(balance.availableAmount).toBeCloseTo(275)

      // Debit: 125
      const prn3 = await createPrn(env, 125)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(350)
      expect(balance.availableAmount).toBeCloseTo(150)

      // Final verification: total credits = 100 + 50 + 200 = 350
      // Total debits = 30 + 45 + 125 = 200
      // Available = 350 - 200 = 150
    })

    it('should handle decimal tonnage values correctly', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Credit: 100.5 (decimal tonnes from summary log)
      await performSummaryLogSubmission(
        env,
        'log-decimal',
        'file-decimal',
        'waste-decimal.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100.5 }])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100.5)
      expect(balance.availableAmount).toBeCloseTo(100.5)

      // Debit: 33 (PRN tonnage must be whole numbers)
      const prn1 = await createPrn(env, 33)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100.5) // Total unchanged
      expect(balance.availableAmount).toBeCloseTo(67.5) // 100.5 - 33 = 67.5

      // Credit: 50.25 (include previous row in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-decimal-2',
        'file-decimal-2',
        'waste-decimal-2.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100.5 },
          { rowId: 2001, exportTonnage: 50.25 }
        ])
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(150.75) // 100.5 + 50.25 = 150.75
      expect(balance.availableAmount).toBeCloseTo(117.75) // 150.75 - 33 = 117.75

      // Debit: 17 (PRN tonnage must be whole numbers)
      const prn2 = await createPrn(env, 17)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(150.75) // Total unchanged
      expect(balance.availableAmount).toBeCloseTo(100.75) // 117.75 - 17 = 100.75
    })

    it('should reject PRN creation when tonnage exceeds available balance', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-negative',
        'file-negative',
        'waste-negative.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(100)

      // Attempt to create PRN for 150 (more than available) - should be rejected
      const prn1 = await createPrn(env, 150)
      const result = await transitionPrnStatus(
        env,
        prn1.id,
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(result.statusCode).toBe(409)
      expect(result.message).toBe('Insufficient available waste balance')

      // Balance should be unchanged
      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(100)
    })

    it('should deduct from total balance when PRN is issued', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Credit: 200
      await performSummaryLogSubmission(
        env,
        'log-issue-1',
        'file-issue-1',
        'waste-issue-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.availableAmount).toBeCloseTo(200)

      // Create PRN for 50 tonnes
      const prn1 = await createPrn(env, 50)

      // Raise PRN (deduct from available only)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(200) // Total unchanged
      expect(balance.availableAmount).toBeCloseTo(150) // 200 - 50 = 150

      // Issue PRN (deduct from total only)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(150) // 200 - 50 = 150 (now deducted)
      expect(balance.availableAmount).toBeCloseTo(150) // Unchanged from issue
    })

    it('should handle complete PRN lifecycle with multiple PRNs', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Credit: 500
      await performSummaryLogSubmission(
        env,
        'log-lifecycle',
        'file-lifecycle',
        'waste-lifecycle.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 500 }])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(500)
      expect(balance.availableAmount).toBeCloseTo(500)

      // Create and raise PRN 1 for 100 tonnes
      const prn1 = await createPrn(env, 100)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(500)
      expect(balance.availableAmount).toBeCloseTo(400) // 500 - 100

      // Create and raise PRN 2 for 75 tonnes
      const prn2 = await createPrn(env, 75)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(500)
      expect(balance.availableAmount).toBeCloseTo(325) // 400 - 75

      // Issue PRN 1 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(400) // 500 - 100
      expect(balance.availableAmount).toBeCloseTo(325) // Unchanged

      // Create and raise PRN 3 for 50 tonnes
      const prn3 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(400) // Unchanged
      expect(balance.availableAmount).toBeCloseTo(275) // 325 - 50

      // Issue PRN 2 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(325) // 400 - 75
      expect(balance.availableAmount).toBeCloseTo(275) // Unchanged

      // Issue PRN 3 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(275) // 325 - 50
      expect(balance.availableAmount).toBeCloseTo(275) // Now matches total

      // Final state: All PRNs issued, total = available = 500 - 100 - 75 - 50 = 275
    })

    it('should handle revisions that affect running totals', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Initial submission: 100 tonnes
      await performSummaryLogSubmission(
        env,
        'log-revision-1',
        'file-revision-1',
        'waste-revision-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(100)

      // Create PRN for 30 tonnes
      const prn1 = await createPrn(env, 30)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(70)

      // Revise the row - reduce to 80 tonnes
      await performSummaryLogSubmission(
        env,
        'log-revision-2',
        'file-revision-2',
        'waste-revision-2.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 80 }])
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(80) // Revised down
      expect(balance.availableAmount).toBeCloseTo(50) // 80 - 30 = 50

      // Create another PRN for 25 tonnes
      const prn2 = await createPrn(env, 25)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(80)
      expect(balance.availableAmount).toBeCloseTo(25) // 50 - 25 = 25

      // Revise up to 120 tonnes
      await performSummaryLogSubmission(
        env,
        'log-revision-3',
        'file-revision-3',
        'waste-revision-3.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 120 }])
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(120) // Revised up
      expect(balance.availableAmount).toBeCloseTo(65) // 120 - 30 - 25 = 65
    })
  })

  describe('transaction audit trail', () => {
    it('should record correct transaction history for series of operations', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-audit-1',
        'file-audit-1',
        'waste-audit-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      // Debit: 40
      const prn1 = await createPrn(env, 40)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      // Credit: 60 (include previous row in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-audit-2',
        'file-audit-2',
        'waste-audit-2.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 2001, exportTonnage: 60 }
        ])
      )

      // Debit: 25
      const prn2 = await createPrn(env, 25)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // Verify final amounts
      expect(balance.amount).toBeCloseTo(160) // 100 + 60
      expect(balance.availableAmount).toBeCloseTo(95) // 160 - 40 - 25

      // Verify we have transactions recorded
      expect(balance.transactions.length).toBeGreaterThanOrEqual(4)

      // Credits from summary logs
      const creditTransactions = balance.transactions.filter(
        (t) => t.type === 'credit'
      )
      expect(creditTransactions.length).toBeGreaterThanOrEqual(2)

      // Debits from PRN creation
      const debitTransactions = balance.transactions.filter(
        (t) => t.type === 'debit'
      )
      expect(debitTransactions.length).toBe(2)

      // Verify PRN debits have correct entity types
      for (const debit of debitTransactions) {
        expect(debit.entities[0].type).toBe('prn:created')
      }
    })
  })
})
