import { http, HttpResponse } from 'msw'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  validToken
} from './integration-test-helpers.js'

describe('Submission and placeholder tests (Exporter)', () => {
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
    const summaryLogId = 'summary-submit-test'
    const fileId = 'file-submit-123'
    const filename = 'waste-data.xlsx'

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
        value: 1,
        location: { sheet: 'Data', row: 4, column: 'B' }
      },
      ACCREDITATION_NUMBER: {
        value: 'ACC-2025-001',
        location: { sheet: 'Data', row: 5, column: 'B' }
      }
    }

    const sharedHeaders = [
      'ROW_ID',
      'DATE_OF_DISPATCH',
      'EWC_CODE',
      'DESCRIPTION_WASTE',
      'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
      'GROSS_WEIGHT',
      'TARE_WEIGHT',
      'PALLET_WEIGHT',
      'NET_WEIGHT',
      'BAILING_WIRE_PROTOCOL',
      'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
      'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
      'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED'
    ]

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
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31'),
            accreditationId
          }
        ],
        accreditations: [
          {
            id: accreditationId,
            accreditationNumber: 'ACC-2025-001',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31')
          }
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository()
      const wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const wasteBalancesRepositoryFactory =
        createInMemoryWasteBalancesRepository([], { organisationsRepository })
      const wasteBalancesRepository = wasteBalancesRepositoryFactory()

      // We'll use a dynamic extractor that we can update with new files
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

          await summaryLogsRepository.update(summaryLogId, version, {
            status: SUMMARY_LOG_STATUS.SUBMITTED
          })
        }
      }

      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

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

    const performSubmission = async (
      env,
      summaryLogId,
      fileId,
      filename,
      uploadData
    ) => {
      const { server, fileDataMap } = env

      // Register the file data for this submission
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

      await server.inject({
        method: 'POST',
        url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      let attempts = 0
      const maxAttempts = 10
      let status = SUMMARY_LOG_STATUS.SUBMITTING

      while (
        status === SUMMARY_LOG_STATUS.SUBMITTING &&
        attempts < maxAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50))

        const checkResponse = await server.inject({
          method: 'GET',
          url: buildGetUrl(organisationId, registrationId, summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })

        status = JSON.parse(checkResponse.payload).status
        attempts++
      }
    }

    it('should update waste balance with transactions', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const firstUploadData = {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            {
              rowNumber: 8,
              values: [
                1001, // ROW_ID
                '2025-01-15T00:00:00.000Z', // DATE_OF_DISPATCH
                '03 03 08', // EWC_CODE
                'Glass - pre-sorted', // DESCRIPTION_WASTE
                'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
                1000, // GROSS_WEIGHT
                100, // TARE_WEIGHT
                50, // PALLET_WEIGHT
                850, // NET_WEIGHT
                'Yes', // BAILING_WIRE_PROTOCOL
                'No', // DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
                null, // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
                100 // TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
              ]
            },
            {
              rowNumber: 9,
              values: [
                1002, // ROW_ID
                '2025-01-16T00:00:00.000Z', // DATE_OF_DISPATCH
                '03 03 08', // EWC_CODE
                'Glass - pre-sorted', // DESCRIPTION_WASTE
                'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
                2000, // GROSS_WEIGHT
                200, // TARE_WEIGHT
                100, // PALLET_WEIGHT
                1700, // NET_WEIGHT
                'Yes', // BAILING_WIRE_PROTOCOL
                'No', // DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
                null, // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
                200 // TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
              ]
            }
          ]
        }
      }

      await performSubmission(
        env,
        summaryLogId,
        fileId,
        filename,
        firstUploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(2)

      // Check total amount
      // 100 + 200 = 300
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      // Verify individual transactions
      const transaction1 = balance.transactions.find(
        (t) => Math.abs(t.amount - 100) < 0.001
      )
      const transaction2 = balance.transactions.find(
        (t) => Math.abs(t.amount - 200) < 0.001
      )

      expect(transaction1).toBeDefined()
      expect(transaction1.type).toBe('credit')
      expect(transaction1.entities).toHaveLength(1)
      expect(transaction1.entities[0].id).toBe('1001')

      expect(transaction2).toBeDefined()
      expect(transaction2.type).toBe('credit')
      expect(transaction2.entities).toHaveLength(1)
      expect(transaction2.entities[0].id).toBe('1002')
    })

    it('should update waste balance correctly when a revised summary log is submitted', async () => {
      const env = await setupIntegrationEnvironment()
      const { wasteBalancesRepository, accreditationId } = env

      const firstUploadData = {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            {
              rowNumber: 8,
              values: [
                1001, // ROW_ID
                '2025-01-15T00:00:00.000Z', // DATE_OF_DISPATCH
                '03 03 08', // EWC_CODE
                'Glass - pre-sorted', // DESCRIPTION_WASTE
                'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
                1000, // GROSS_WEIGHT
                100, // TARE_WEIGHT
                50, // PALLET_WEIGHT
                850, // NET_WEIGHT
                'Yes', // BAILING_WIRE_PROTOCOL
                'No', // DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
                null, // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
                100 // TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
              ]
            },
            {
              rowNumber: 9,
              values: [
                1002, // ROW_ID
                '2025-01-16T00:00:00.000Z', // DATE_OF_DISPATCH
                '03 03 08', // EWC_CODE
                'Glass - pre-sorted', // DESCRIPTION_WASTE
                'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
                2000, // GROSS_WEIGHT
                200, // TARE_WEIGHT
                100, // PALLET_WEIGHT
                1700, // NET_WEIGHT
                'Yes', // BAILING_WIRE_PROTOCOL
                'No', // DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
                null, // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
                200 // TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
              ]
            }
          ]
        }
      }

      // First submission
      await performSubmission(
        env,
        'summary-log-1',
        'file-1',
        'waste-data.xlsx',
        firstUploadData
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      // Second submission (revised data)
      const secondUploadData = {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            {
              rowNumber: 8,
              values: [
                1001, // ROW_ID
                '2025-01-15T00:00:00.000Z', // DATE_OF_DISPATCH
                '03 03 08', // EWC_CODE
                'Glass - pre-sorted', // DESCRIPTION_WASTE
                'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
                1000, // GROSS_WEIGHT
                100, // TARE_WEIGHT
                50, // PALLET_WEIGHT
                850, // NET_WEIGHT
                'Yes', // BAILING_WIRE_PROTOCOL
                'No', // DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
                null, // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
                100 // TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED
              ]
            },
            {
              rowNumber: 9,
              values: [
                1002, // ROW_ID
                '2025-01-16T00:00:00.000Z', // DATE_OF_DISPATCH
                '03 03 08', // EWC_CODE
                'Glass - pre-sorted', // DESCRIPTION_WASTE
                'No', // WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE
                1000, // GROSS_WEIGHT (Changed)
                100, // TARE_WEIGHT (Changed)
                50, // PALLET_WEIGHT (Changed)
                850, // NET_WEIGHT (Changed)
                'Yes', // BAILING_WIRE_PROTOCOL
                'No', // DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE
                null, // TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR
                100 // TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED (Changed from 200 to 100)
              ]
            }
          ]
        }
      }

      // Submit revised log (new summary log ID, new file ID)
      await performSubmission(
        env,
        'summary-log-2',
        'file-2',
        'waste-data-v2.xlsx',
        secondUploadData
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // 100 + 100 = 200
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.availableAmount).toBeCloseTo(200)

      // Verify transactions
      expect(balance.transactions).toHaveLength(3)

      // 1. Original credit for row 1001 (100)
      const tx1 = balance.transactions.find(
        (t) => t.entities[0].id === '1001' && t.type === 'credit'
      )
      expect(tx1).toBeDefined()
      expect(tx1.amount).toBeCloseTo(100)

      // 2. Original credit for row 1002 (200)
      const tx2 = balance.transactions.find(
        (t) => t.entities[0].id === '1002' && t.type === 'credit'
      )
      expect(tx2).toBeDefined()
      expect(tx2.amount).toBeCloseTo(200)
      expect(tx2.entities[0].previousVersionIds).toHaveLength(0)
      const v1Id = tx2.entities[0].currentVersionId
      expect(v1Id).toBeDefined()

      // 3. Debit for row 1002 (100) - correction
      const tx3 = balance.transactions.find(
        (t) => t.entities[0].id === '1002' && t.type === 'debit'
      )
      expect(tx3).toBeDefined()
      expect(tx3.amount).toBeCloseTo(100)
      expect(tx3.entities[0].currentVersionId).not.toBe(v1Id)
      expect(tx3.entities[0].previousVersionIds).toContain(v1Id)
    })
  })
})
