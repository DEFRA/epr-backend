import { http, HttpResponse } from 'msw'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
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
    const secondFileId = 'file-submit-456'
    let wasteRecordsRepository
    let wasteBalancesRepository
    let server
    let accreditationId

    beforeEach(async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      accreditationId = new ObjectId().toString()
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

      const firstUploadData = {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            {
              rowNumber: 8,
              values: [
                1001,
                '2025-01-15T00:00:00.000Z',
                '03 03 08',
                'Glass - pre-sorted',
                'No',
                1000,
                100,
                50,
                850,
                'Yes',
                'No',
                null,
                678.98
              ]
            },
            {
              rowNumber: 9,
              values: [
                1002,
                '2025-01-16T00:00:00.000Z',
                '03 03 08',
                'Glass - pre-sorted',
                'No',
                900,
                90,
                45,
                765,
                'Yes',
                'No',
                null,
                611.028
              ]
            }
          ]
        }
      }

      const secondUploadData = {
        RECEIVED_LOADS_FOR_EXPORT: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            {
              rowNumber: 8,
              values: [
                1001,
                '2025-01-15T00:00:00.000Z',
                '03 03 08',
                'Glass - pre-sorted',
                'No',
                1000,
                100,
                50,
                850,
                'Yes',
                'No',
                null,
                678.98 // unchanged
              ]
            },
            {
              rowNumber: 9,
              values: [
                1002,
                '2025-01-16T00:00:00.000Z',
                '03 03 08',
                'Glass - pre-sorted',
                'No',
                950,
                95,
                48,
                807,
                'Yes',
                'No',
                null,
                644.182275 // adjusted
              ]
            },
            {
              rowNumber: 10,
              values: [
                1003,
                '2025-01-17T00:00:00.000Z',
                '03 03 08',
                'Glass - pre-sorted',
                'No',
                800,
                80,
                40,
                680,
                'Yes',
                'No',
                null,
                543.184 // new
              ]
            }
          ]
        }
      }

      const validationExtractor = createInMemorySummaryLogExtractor({
        [fileId]: { meta: sharedMeta, data: {} },
        [secondFileId]: { meta: sharedMeta, data: secondUploadData }
      })

      const transformationExtractor = createInMemorySummaryLogExtractor({
        [fileId]: { meta: sharedMeta, data: firstUploadData },
        [secondFileId]: { meta: sharedMeta, data: secondUploadData }
      })

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository()
      wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const wasteBalancesRepositoryFactory =
        createInMemoryWasteBalancesRepository([], { organisationsRepository })
      wasteBalancesRepository = wasteBalancesRepositoryFactory()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor: validationExtractor
      })

      const syncWasteRecords = syncFromSummaryLog({
        extractor: transformationExtractor,
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

      server = await createTestServer({
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
    })

    it('should update waste balance with transactions', async () => {
      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(2)

      // Check total amount
      // 678.98 + 611.028 = 1290.008
      expect(balance.amount).toBeCloseTo(1290.008)
      expect(balance.availableAmount).toBeCloseTo(1290.008)

      // Verify individual transactions
      const transaction1 = balance.transactions.find(
        (t) => Math.abs(t.amount - 678.98) < 0.001
      )
      const transaction2 = balance.transactions.find(
        (t) => Math.abs(t.amount - 611.028) < 0.001
      )

      expect(transaction1).toBeDefined()
      expect(transaction1.type).toBe('credit')
      expect(transaction1.entities).toHaveLength(1)
      expect(transaction1.entities[0].id).toBe(1001)

      expect(transaction2).toBeDefined()
      expect(transaction2.type).toBe('credit')
      expect(transaction2.entities).toHaveLength(1)
      expect(transaction2.entities[0].id).toBe(1002)
    })
  })
})
