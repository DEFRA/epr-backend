import { http, HttpResponse } from 'msw'
import { ObjectId } from 'mongodb'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  buildOrganisation,
  getValidDateRange
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
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

describe('Repeated uploads of identical data', () => {
  let organisationId
  let registrationId
  const { VALID_FROM, VALID_TO } = getValidDateRange()

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

  describe('when the same data is uploaded and submitted twice', () => {
    const firstSummaryLogId = 'summary-log-first-upload'
    const secondSummaryLogId = 'summary-log-second-upload'
    const firstFileId = 'file-first-upload'
    const secondFileId = 'file-second-upload'

    let server
    let wasteRecordsRepository
    let secondUploadResponse

    beforeEach(async () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }

      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)
      const uploadsRepository = createInMemoryUploadsRepository()

      // Set up organisation with registration
      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG-12345',
            status: 'approved',
            material: 'glass',
            glassRecyclingProcess: ['glass_re_melt'],
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
            formSubmissionTime: new Date(),
            submittedToRegulator: 'ea',
            validFrom: VALID_FROM,
            validTo: VALID_TO,
            accreditation: {
              accreditationNumber: 'ACC-2025-001'
            }
          }
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()

      // Define shared metadata and headers
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
          value: 'Glass_remelt',
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

      // Identical data for both uploads - matching existing test pattern
      const sharedRows = [
        {
          rowNumber: 8,
          values: [
            1001,
            '2025-01-15',
            '03 03 08',
            'Glass - pre-sorted',
            'No',
            1000,
            100,
            50,
            850,
            'Yes',
            'Actual weight (100%)',
            50,
            0.85,
            678.98, // (850-50)*0.9985*0.85
            // Supplementary fields left empty
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
          ]
        },
        {
          rowNumber: 9,
          values: [
            1002,
            '2025-01-16',
            '03 03 08',
            'Glass - pre-sorted',
            'No',
            900,
            90,
            45,
            765,
            'Yes',
            'Actual weight (100%)',
            45,
            0.85,
            611.082, // (765-45)*0.9985*0.85
            // Supplementary fields left empty
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            ''
          ]
        }
      ]

      const identicalUploadData = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: sharedRows
        }
      }

      // Both file IDs return identical data
      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [firstFileId]: { meta: sharedMeta, data: identicalUploadData },
        [secondFileId]: { meta: sharedMeta, data: identicalUploadData }
      })

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository()
      wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })

      const syncWasteRecords = syncFromSummaryLog({
        extractor: summaryLogExtractor,
        wasteRecordRepository: wasteRecordsRepository
      })

      const summaryLogsWorker = {
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
          organisationsRepository: () => organisationsRepository
        },
        workers: {
          summaryLogsWorker
        },
        featureFlags
      })

      // === First upload: upload, validate, submit ===
      await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, firstSummaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.COMPLETE,
          firstFileId,
          'waste-data.xlsx'
        )
      })

      await pollForValidation(
        server,
        organisationId,
        registrationId,
        firstSummaryLogId
      )

      await server.inject({
        method: 'POST',
        url: buildSubmitUrl(organisationId, registrationId, firstSummaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      await pollWhileStatus(
        server,
        organisationId,
        registrationId,
        firstSummaryLogId,
        { waitWhile: SUMMARY_LOG_STATUS.SUBMITTING }
      )

      // === Second upload: upload the same data again ===
      secondUploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, secondSummaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.COMPLETE,
          secondFileId,
          'waste-data.xlsx'
        )
      })

      await pollForValidation(
        server,
        organisationId,
        registrationId,
        secondSummaryLogId
      )
    })

    it('should accept the second upload', () => {
      expect(secondUploadResponse.statusCode).toBe(202)
    })

    it('should classify all loads as unchanged on second upload', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, secondSummaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)

      // Check no validation failures first - will show issues if any
      expect(payload.validation?.failures ?? []).toEqual([])
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

      // No loads should be added or adjusted
      expect(payload.loads.added.valid.count).toBe(0)
      expect(payload.loads.added.invalid.count).toBe(0)
      expect(payload.loads.adjusted.valid.count).toBe(0)
      expect(payload.loads.adjusted.invalid.count).toBe(0)

      // All loads should be unchanged
      const totalUnchanged =
        payload.loads.unchanged.valid.count +
        payload.loads.unchanged.invalid.count
      expect(totalUnchanged).toBeGreaterThan(0)
    })

    it(
      'should not create additional waste record versions on second submission',
      { timeout: 60000 },
      async () => {
        // Get waste records before second submission
        const recordsBefore = await wasteRecordsRepository.findByRegistration(
          organisationId,
          registrationId
        )
        const versionCountsBefore = recordsBefore.map((r) => r.versions.length)

        // Submit the second upload
        await server.inject({
          method: 'POST',
          url: buildSubmitUrl(
            organisationId,
            registrationId,
            secondSummaryLogId
          ),
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        await pollWhileStatus(
          server,
          organisationId,
          registrationId,
          secondSummaryLogId,
          { waitWhile: SUMMARY_LOG_STATUS.SUBMITTING }
        )

        // Get waste records after second submission
        const recordsAfter = await wasteRecordsRepository.findByRegistration(
          organisationId,
          registrationId
        )
        const versionCountsAfter = recordsAfter.map((r) => r.versions.length)

        // Version counts should be unchanged (no new versions created)
        expect(versionCountsAfter).toEqual(versionCountsBefore)
      }
    )
  })
})
