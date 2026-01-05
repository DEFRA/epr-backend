import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
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

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  pollWhileStatus
} from './integration-test-helpers.js'

const RECEIVED_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
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
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'YOUR_REFERENCE',
  'WEIGHBRIDGE_TICKET',
  'CARRIER_NAME',
  'CBD_REG_NUMBER',
  'CARRIER_VEHICLE_REGISTRATION_NUMBER'
]

const SENT_ON_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  'FINAL_DESTINATION_FACILITY_TYPE',
  'FINAL_DESTINATION_NAME',
  'FINAL_DESTINATION_ADDRESS',
  'FINAL_DESTINATION_POSTCODE',
  'FINAL_DESTINATION_EMAIL',
  'FINAL_DESTINATION_PHONE',
  'YOUR_REFERENCE',
  'DESCRIPTION_WASTE',
  'EWC_CODE',
  'WEIGHBRIDGE_TICKET'
]

describe('Submission and placeholder tests (Reprocessor Input)', () => {
  let organisationId
  let registrationId

  const { getServer } = setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()

    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('submitting a validated summary log', () => {
    const summaryLogId = 'summary-submit-test-repro'
    const fileId = 'file-submit-repro-123'
    const filename = 'waste-data-repro.xlsx'

    const sharedMeta = {
      REGISTRATION_NUMBER: {
        value: 'REG-12345',
        location: { sheet: 'Data', row: 1, column: 'B' }
      },
      PROCESSING_TYPE: {
        value: 'REPROCESSOR_INPUT',
        location: { sheet: 'Data', row: 2, column: 'B' }
      },
      MATERIAL: {
        value: 'Paper_and_board',
        location: { sheet: 'Data', row: 3, column: 'B' }
      },
      TEMPLATE_VERSION: {
        value: 1,
        location: { sheet: 'Data', row: 4, column: 'B' }
      },
      ACCREDITATION_NUMBER: {
        value: 'ACC-2025-001',
        location: { sheet: 'Data', row: 5, column: 'B' }
      }
    }

    const createReceivedRowValues = (overrides = {}) => {
      const tonnage = overrides.tonnageReceived ?? 850
      const d = {
        rowId: 1001,
        dateReceived: '2025-01-15T00:00:00.000Z',
        ewcCode: '15 01 01',
        wasteDescription: 'Paper - other',
        prnIssued: 'No',
        grossWeight: tonnage + 150,
        tareWeight: 100,
        palletWeight: 50,
        netWeight: tonnage,
        bailingWire: 'No',
        recyclablePropMethod: 'Actual weight (100%)',
        nonTargetWeight: 0,
        recyclablePropPct: 1,
        tonnageReceived: tonnage,
        supplierName: 'Supplier A',
        supplierAddress: '123 Street',
        supplierPostcode: 'AB1 2CD',
        supplierEmail: 'supplier@example.com',
        supplierPhone: '0123456789',
        yourReference: 'REF123',
        weighbridgeTicket: 'WB123',
        carrierName: 'Carrier A',
        cbdRegNumber: 'CBD123',
        carrierVehicleReg: 'AB12 CDE',
        ...overrides
      }
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
        d.supplierName,
        d.supplierAddress,
        d.supplierPostcode,
        d.supplierEmail,
        d.supplierPhone,
        'Activities', // activitiesCarriedOutBySupplier
        d.yourReference,
        d.weighbridgeTicket,
        d.carrierName,
        d.cbdRegNumber,
        d.carrierVehicleReg
      ]
    }

    const createSentOnRowValues = (overrides = {}) => {
      const d = {
        rowId: 5001,
        dateLeft: '2025-01-20T00:00:00.000Z',
        tonnageSent: 100,
        destinationType: 'Reprocessor',
        destinationName: 'Dest A',
        destinationAddress: '456 Road',
        destinationPostcode: 'XY9 8ZW',
        destinationEmail: 'dest@example.com',
        destinationPhone: '0987654321',
        yourReference: 'REF456',
        wasteDescription: 'Paper',
        ewcCode: '15 01 01',
        weighbridgeTicket: 'WB456',
        ...overrides
      }
      return [
        d.rowId,
        d.dateLeft,
        d.tonnageSent,
        d.destinationType,
        d.destinationName,
        d.destinationAddress,
        d.destinationPostcode,
        d.destinationEmail,
        d.destinationPhone,
        d.yourReference,
        d.wasteDescription,
        d.ewcCode,
        d.weighbridgeTicket
      ]
    }

    const createUploadData = (receivedRows = [], sentOnRows = []) => ({
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Received', row: 7, column: 'A' },
        headers: RECEIVED_HEADERS,
        rows: receivedRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createReceivedRowValues(row)
        }))
      },
      SENT_ON_LOADS: {
        location: { sheet: 'Sent', row: 7, column: 'A' },
        headers: SENT_ON_HEADERS,
        rows: sentOnRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createSentOnRowValues(row)
        }))
      }
    })

    const setupIntegrationEnvironment = async () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn()
      }

      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)
      const uploadsRepository = createInMemoryUploadsRepository()
      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository()
      const wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const accreditationId = new ObjectId().toString()
      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG-12345',
            status: 'approved',
            material: 'paper',
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
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

      const wasteBalancesRepositoryFactory =
        createInMemoryWasteBalancesRepository([], { organisationsRepository })
      const wasteBalancesRepository = wasteBalancesRepositoryFactory()

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

      const featureFlags = createInMemoryFeatureFlags({
        summaryLogs: true,
        calculateWasteBalanceOnImport: true
      })

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor: dynamicExtractor
      })

      const syncWasteRecords = syncFromSummaryLog({
        extractor: dynamicExtractor,
        wasteRecordRepository: wasteRecordsRepository,
        wasteBalancesRepository,
        organisationsRepository,
        featureFlags
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

      const server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository,
          wasteRecordsRepository: wasteRecordsRepositoryFactory,
          organisationsRepository: () => organisationsRepository,
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        workers: {
          summaryLogsWorker: submitterWorker
        },
        featureFlags
      })

      return {
        server,
        wasteBalancesRepository,
        accreditationId,
        fileDataMap
      }
    }

    const uploadAndValidate = async (
      env,
      summaryLogId,
      fileId,
      filename,
      uploadData
    ) => {
      const { server, fileDataMap } = env

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
      const { server } = env

      await server.inject({
        method: 'POST',
        url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      return pollWhileStatus(
        server,
        organisationId,
        registrationId,
        summaryLogId,
        {
          waitWhile: SUMMARY_LOG_STATUS.SUBMITTING
        }
      )
    }

    const performSubmission = async (
      env,
      summaryLogId,
      fileId,
      filename,
      uploadData
    ) => {
      await uploadAndValidate(env, summaryLogId, fileId, filename, uploadData)
      await submitAndPoll(env, summaryLogId)
    }

    it('should update waste balance with credits from received loads', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        { rowId: 1001, tonnageReceived: 100 },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: '2025-01-16T00:00:00.000Z'
        }
      ])

      await performSubmission(env, summaryLogId, fileId, filename, uploadData)

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(2)

      // 100 + 200 = 300
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      const transaction1 = balance.transactions.find(
        (t) => t.entities[0].id === '1001'
      )
      expect(transaction1).toBeDefined()
      expect(transaction1.type).toBe('credit')
      expect(transaction1.amount).toBeCloseTo(100)
    })

    it('should update waste balance with debits from sent on loads', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData(
        [{ rowId: 1001, tonnageReceived: 500 }], // Initial credit to allow debits
        [
          {
            rowId: 5001,
            tonnageSent: 100,
            dateLeft: '2025-01-20T00:00:00.000Z'
          }
        ]
      )

      await performSubmission(env, summaryLogId, fileId, filename, uploadData)

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(2)

      // 500 (credit) - 100 (debit) = 400
      expect(balance.amount).toBeCloseTo(400)
      expect(balance.availableAmount).toBeCloseTo(400)

      const debitTx = balance.transactions.find(
        (t) => t.entities[0].id === '5001'
      )
      expect(debitTx).toBeDefined()
      expect(debitTx.type).toBe('debit')
      expect(debitTx.amount).toBeCloseTo(100)
    })

    it('should not create credit transaction if PRN was issued on received load', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        { rowId: 1001, tonnageReceived: 100, prnIssued: 'Yes' },
        { rowId: 1002, tonnageReceived: 200, prnIssued: 'No' }
      ])

      await performSubmission(
        env,
        'summary-prn-check',
        'file-prn-check',
        'waste-data-prn.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.transactions[0].entities[0].id).toBe('1002')
    })

    it('should not create transaction for received load outside accreditation period', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        {
          rowId: 1001,
          tonnageReceived: 100,
          dateReceived: '2024-12-31T00:00:00.000Z' // Before 2025-01-01
        },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: '2025-01-01T00:00:00.000Z' // On start date
        }
      ])

      await performSubmission(
        env,
        'summary-date-check',
        'file-date-check',
        'waste-data-date.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.transactions[0].entities[0].id).toBe('1002')
    })

    it('should not create transaction for sent on load outside accreditation period', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData(
        [{ rowId: 1001, tonnageReceived: 500 }], // Initial credit
        [
          {
            rowId: 5001,
            tonnageSent: 100,
            dateLeft: '2024-12-31T00:00:00.000Z' // Before period
          },
          {
            rowId: 5002,
            tonnageSent: 50,
            dateLeft: '2025-01-01T00:00:00.000Z' // In period
          }
        ]
      )

      await performSubmission(
        env,
        'summary-sent-date-check',
        'file-sent-date-check',
        'waste-data-sent-date.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // 500 (credit) - 50 (debit) = 450
      // Row 5001 should be ignored
      expect(balance.amount).toBeCloseTo(450)

      const debitTx = balance.transactions.find((t) => t.type === 'debit')
      expect(debitTx).toBeDefined()
      expect(debitTx.entities[0].id).toBe('5002')
      expect(debitTx.amount).toBeCloseTo(50)
    })

    it('should handle revisions correctly (credit -> debit)', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // First submission: Valid credit
      const firstUploadData = createUploadData([
        { rowId: 1001, tonnageReceived: 100, prnIssued: 'No' }
      ])

      await performSubmission(
        env,
        'summary-rev-1',
        'file-rev-1',
        'waste-data-v1.xlsx',
        firstUploadData
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)

      // Second submission: Revised to PRN Issued (should reverse credit)
      const secondUploadData = createUploadData([
        { rowId: 1001, tonnageReceived: 100, prnIssued: 'Yes' }
      ])

      await performSubmission(
        env,
        'summary-rev-2',
        'file-rev-2',
        'waste-data-v2.xlsx',
        secondUploadData
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(0)

      // Should have original credit and corrective debit
      expect(balance.transactions).toHaveLength(2)
      const debitTx = balance.transactions.find((t) => t.type === 'debit')
      expect(debitTx.entities[0].id).toBe('1001')
      expect(debitTx.amount).toBeCloseTo(100)
    })

    it('should not create transaction if mandatory fields are missing (AC01d)', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        {
          rowId: 1001,
          tonnageReceived: 100,
          ewcCode: '' // Missing mandatory field
        },
        {
          rowId: 1002,
          tonnageReceived: 200,
          ewcCode: '15 01 01' // All mandatory fields present
        }
      ])

      await performSubmission(
        env,
        'summary-mandatory-check',
        'file-mandatory-check',
        'waste-data-mandatory.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // Only row 1002 should contribute
      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.transactions[0].entities[0].id).toBe('1002')
    })

    it('should correctly calculate tonnage with bailing wire deduction (Requirement Note)', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      // (1000 gross - 100 tare - 50 pallet) = 850 net
      // 850 net * 0.9985 (bailing wire) = 848.725
      const uploadData = createUploadData([
        {
          rowId: 1001,
          grossWeight: 1000,
          tareWeight: 100,
          palletWeight: 50,
          netWeight: 850,
          bailingWire: 'Yes',
          nonTargetWeight: 0,
          recyclablePropPct: 1,
          tonnageReceived: 848.725
        }
      ])

      await performSubmission(
        env,
        'summary-bailing-check',
        'file-bailing-check',
        'waste-data-bailing.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance.amount).toBeCloseTo(848.725)
    })
  })
})
