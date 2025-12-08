import ExcelJS from 'exceljs'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { parseS3Uri } from '#adapters/repositories/uploads/s3-uri.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogExtractor } from '#application/summary-logs/extractor.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  validToken,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  pollForValidation
} from './integration-test-helpers.js'

describe('Submission and placeholder tests', () => {
  let organisationId
  let registrationId

  setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()
  })

  describe('submitting a validated summary log', () => {
    const summaryLogId = 'summary-submit-test'
    const fileId = 'file-submit-123'
    const filename = 'waste-data.xlsx'
    const secondSummaryLogId = 'summary-submit-test-2'
    const secondFileId = 'file-submit-456'
    const secondFilename = 'waste-data-2.xlsx'
    let wasteRecordsRepository
    let submitResponse
    let server

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

      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG-12345',
            status: 'approved',
            material: 'paper',
            wasteProcessingType: 'reprocessor',
            formSubmissionTime: new Date(),
            submittedToRegulator: 'ea',
            validFrom: new Date('2025-01-01'),
            validTo: new Date('2025-12-31'),
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

      const sharedHeaders = [
        'ROW_ID',
        'DATE_RECEIVED_FOR_REPROCESSING',
        'EWC_CODE',
        'GROSS_WEIGHT',
        'TARE_WEIGHT',
        'PALLET_WEIGHT',
        'NET_WEIGHT',
        'BAILING_WIRE_PROTOCOL',
        'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
        'WEIGHT_OF_NON_TARGET_MATERIALS',
        'RECYCLABLE_PROPORTION_PERCENTAGE',
        'TONNAGE_RECEIVED_FOR_RECYCLING'
      ]

      const firstUploadData = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            [
              1001,
              '2025-01-15T00:00:00.000Z',
              '03 03 08',
              1000,
              100,
              50,
              850,
              'YES',
              'WEIGHT',
              50,
              0.85,
              850
            ],
            [
              1002,
              '2025-01-16T00:00:00.000Z',
              '03 03 08',
              2000,
              200,
              100,
              1700,
              'YES',
              'WEIGHT',
              100,
              0.85,
              1700
            ]
          ]
        }
      }

      const secondUploadData = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Received', row: 7, column: 'A' },
          headers: sharedHeaders,
          rows: [
            [
              1001,
              '2025-01-15T00:00:00.000Z',
              '03 03 08',
              1000,
              100,
              50,
              850,
              'YES',
              'WEIGHT',
              50,
              0.85,
              850
            ],
            [
              1002,
              '2025-01-16T00:00:00.000Z',
              '03 03 08',
              2500,
              250,
              125,
              2125,
              'YES',
              'WEIGHT',
              125,
              0.85,
              2125
            ],
            [
              1003,
              '2025-01-17T00:00:00.000Z',
              '03 03 08',
              3000,
              300,
              150,
              2550,
              'YES',
              'WEIGHT',
              150,
              0.85,
              2550
            ]
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

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor: validationExtractor
      })

      const syncWasteRecords = syncFromSummaryLog({
        extractor: transformationExtractor,
        wasteRecordRepository: wasteRecordsRepository
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
          organisationsRepository: () => organisationsRepository
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

      submitResponse = await server.inject({
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

    it('should return OK', () => {
      expect(submitResponse.statusCode).toBe(200)
    })

    it('should create waste records from summary log data', async () => {
      const wasteRecords = await wasteRecordsRepository.findByRegistration(
        organisationId,
        registrationId
      )

      expect(wasteRecords).toHaveLength(2)
      expect(wasteRecords[0].rowId).toBe(1001)
      expect(wasteRecords[1].rowId).toBe(1002)
    })

    it('should update summary log status to SUBMITTED', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    })

    it('should include accreditation number in response after submission', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.accreditationNumber).toBe('ACC-2025-001')
    })

    it('should classify loads as added, adjusted, and unchanged on second upload', async () => {
      await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, secondSummaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.COMPLETE,
          secondFileId,
          secondFilename
        ),
        headers: { Authorization: `Bearer ${validToken}` }
      })
      await pollForValidation(
        server,
        organisationId,
        registrationId,
        secondSummaryLogId
      )

      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, secondSummaryLogId),
        headers: { Authorization: `Bearer ${validToken}` }
      })

      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

      expect(payload.loads.added.valid.count).toBe(1)
      expect(payload.loads.added.valid.rowIds).toContain(1003)

      expect(payload.loads.adjusted.valid.count).toBe(1)
      expect(payload.loads.adjusted.valid.rowIds).toContain(1002)

      expect(payload.loads.unchanged.valid.count).toBe(1)
      expect(payload.loads.unchanged.valid.rowIds).toContain(1001)
    })
  })

  describe('placeholder text normalization with real Excel parsing', () => {
    const summaryLogId = 'summary-placeholder-test'
    const fileId = 'file-placeholder-test'
    const filename = 'placeholder-test.xlsx'
    let uploadResponse
    let testSummaryLogsRepository
    let uploadsRepository
    let server

    const createExcelWithPlaceholders = async () => {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Data')

      worksheet.getCell('A1').value = '__EPR_META_REGISTRATION_NUMBER'
      worksheet.getCell('B1').value = 'REG-123'

      worksheet.getCell('A2').value = '__EPR_META_PROCESSING_TYPE'
      worksheet.getCell('B2').value = 'REPROCESSOR_INPUT'

      worksheet.getCell('A3').value = '__EPR_META_MATERIAL'
      worksheet.getCell('B3').value = 'Paper_and_board'

      worksheet.getCell('A4').value = '__EPR_META_TEMPLATE_VERSION'
      worksheet.getCell('B4').value = 1

      worksheet.getCell('A6').value =
        '__EPR_DATA_RECEIVED_LOADS_FOR_REPROCESSING'
      worksheet.getCell('B6').value = 'ROW_ID'
      worksheet.getCell('C6').value = 'DATE_RECEIVED_FOR_REPROCESSING'
      worksheet.getCell('D6').value = 'EWC_CODE'
      worksheet.getCell('E6').value = 'GROSS_WEIGHT'
      worksheet.getCell('F6').value = 'TARE_WEIGHT'
      worksheet.getCell('G6').value = 'PALLET_WEIGHT'
      worksheet.getCell('H6').value = 'NET_WEIGHT'
      worksheet.getCell('I6').value = 'BAILING_WIRE_PROTOCOL'
      worksheet.getCell('J6').value =
        'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
      worksheet.getCell('K6').value = 'WEIGHT_OF_NON_TARGET_MATERIALS'
      worksheet.getCell('L6').value = 'RECYCLABLE_PROPORTION_PERCENTAGE'
      worksheet.getCell('M6').value = 'TONNAGE_RECEIVED_FOR_RECYCLING'

      worksheet.getCell('B7').value = 10000000001
      worksheet.getCell('C7').value = new Date('2025-05-28')
      worksheet.getCell('D7').value = '03 03 08'
      worksheet.getCell('E7').value = 1000
      worksheet.getCell('F7').value = 100
      worksheet.getCell('G7').value = 50
      worksheet.getCell('H7').value = 850
      worksheet.getCell('I7').value = 'YES'
      worksheet.getCell('J7').value = 'WEIGHT'
      worksheet.getCell('K7').value = 50
      worksheet.getCell('L7').value = 0.85
      worksheet.getCell('M7').value = 850

      worksheet.getCell('B8').value = 10000000002
      worksheet.getCell('C8').value = new Date('2025-05-29')
      worksheet.getCell('D8').value = 'Choose option'
      worksheet.getCell('E8').value = 2000
      worksheet.getCell('F8').value = 200
      worksheet.getCell('G8').value = 100
      worksheet.getCell('H8').value = 1700
      worksheet.getCell('I8').value = 'Choose option'
      worksheet.getCell('J8').value = 'Choose option'
      worksheet.getCell('K8').value = 100
      worksheet.getCell('L8').value = 0.9
      worksheet.getCell('M8').value = 1700

      worksheet.getCell('B9').value = null
      worksheet.getCell('C9').value = null
      worksheet.getCell('D9').value = 'Choose option'
      worksheet.getCell('E9').value = null
      worksheet.getCell('F9').value = null
      worksheet.getCell('G9').value = null
      worksheet.getCell('H9').value = null
      worksheet.getCell('I9').value = 'Choose option'
      worksheet.getCell('J9').value = 'Choose option'
      worksheet.getCell('K9').value = null
      worksheet.getCell('L9').value = null
      worksheet.getCell('M9').value = null

      worksheet.getCell('B10').value = 99999999999
      worksheet.getCell('C10').value = new Date('2025-12-31')
      worksheet.getCell('D10').value = '03 03 08'
      worksheet.getCell('E10').value = 9999
      worksheet.getCell('F10').value = 999
      worksheet.getCell('G10').value = 99
      worksheet.getCell('H10').value = 8901
      worksheet.getCell('I10').value = 'NO'
      worksheet.getCell('J10').value = 'WEIGHT'
      worksheet.getCell('K10').value = 500
      worksheet.getCell('L10').value = 0.5
      worksheet.getCell('M10').value = 4450

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG-123',
            material: 'paper',
            wasteProcessingType: 'reprocessor',
            formSubmissionTime: new Date(),
            submittedToRegulator: 'ea'
          }
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()

      const excelBuffer = await createExcelWithPlaceholders()

      const { uploadId } = await uploadsRepository.initiateSummaryLogUpload({
        organisationId,
        registrationId,
        summaryLogId,
        redirectUrl: 'https://frontend.test/redirect',
        callbackUrl: `http://localhost:3001/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`
      })
      const { s3Uri } = await uploadsRepository.completeUpload(
        uploadId,
        excelBuffer
      )

      const { Bucket: s3Bucket, Key: s3Key } = parseS3Uri(s3Uri)

      const summaryLogExtractor = createSummaryLogExtractor({
        uploadsRepository,
        logger: mockLogger
      })

      const wasteRecordsRepository = createInMemoryWasteRecordsRepository()()

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor
      })
      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        },
        featureFlags
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: {
          uploadStatus: 'ready',
          metadata: {
            organisationId,
            registrationId
          },
          form: {
            summaryLogUpload: {
              fileId,
              filename,
              fileStatus: UPLOAD_STATUS.COMPLETE,
              contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentLength: excelBuffer.length,
              checksumSha256: 'abc123def456',
              detectedContentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              s3Bucket,
              s3Key
            }
          },
          numberOfRejectedFiles: 0
        },
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    })

    it('should return ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    describe('retrieving summary log after parsing with placeholder normalization', () => {
      let response

      beforeEach(async () => {
        await pollForValidation(
          server,
          organisationId,
          registrationId,
          summaryLogId
        )

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(organisationId, registrationId, summaryLogId),
          headers: {
            Authorization: `Bearer ${validToken}`
          }
        })
      })

      it('should return OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('should validate successfully with placeholder text normalized to null', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })

      it('should document placeholder normalization behavior in integration context', () => {
        const payload = JSON.parse(response.payload)

        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

        expect(payload.validation.failures).toEqual([])

        const concerns = payload.validation.concerns
        expect(concerns.RECEIVED_LOADS_FOR_REPROCESSING).toBeDefined()
        expect(concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows).toHaveLength(1)

        const row8Issues = concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
        expect(row8Issues.row).toBe(8)

        const issueHeaders = row8Issues.issues.map((i) => i.header)
        expect(issueHeaders).toContain('EWC_CODE')
      })

      it('should terminate data section at row with all placeholder values', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })
    })
  })
})
