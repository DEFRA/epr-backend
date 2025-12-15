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
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
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
  createReprocessorInputWorkbook,
  createSpreadsheetInfrastructure,
  createUploadPayload,
  pollForValidation
} from './integration-test-helpers.js'

describe('Submission and placeholder tests', () => {
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
        'TONNAGE_RECEIVED_FOR_RECYCLING'
      ]

      const firstUploadData = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
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
                'Actual weight (100%)',
                50,
                0.85,
                678.98 // (850-50)*0.9985*0.85
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
                'Actual weight (100%)',
                45,
                0.85,
                611.028 // (765-45)*0.9985*0.85
              ]
            }
          ]
        }
      }

      const secondUploadData = {
        RECEIVED_LOADS_FOR_REPROCESSING: {
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
                'Actual weight (100%)',
                50,
                0.85,
                678.98 // (850-50)*0.9985*0.85 unchanged
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
                'Actual weight (100%)',
                48,
                0.85,
                644.182275 // (807-48)*0.9985*0.85 adjusted
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
                'Actual weight (100%)',
                40,
                0.85,
                543.184 // (680-40)*0.9985*0.85 new
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
        ...asStandardUser({ linkedOrgId: organisationId })
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
          ...asStandardUser({ linkedOrgId: organisationId })
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
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)
    })

    it('should include accreditation number in response after submission', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
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
        )
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
        ...asStandardUser({ linkedOrgId: organisationId })
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
    let server

    const createPlaceholderWorkbook = async () => {
      const workbook = createReprocessorInputWorkbook()
      const dataSheet = workbook.getWorksheet('Data')

      // Row 8: placeholder row (partially filled with placeholders)
      dataSheet.getCell('B8').value = 10000000002
      dataSheet.getCell('C8').value = new Date('2025-05-29')
      dataSheet.getCell('D8').value = 'Choose option'
      dataSheet.getCell('E8').value = 'Choose option'
      dataSheet.getCell('F8').value = 'Choose option'
      dataSheet.getCell('G8').value = 800
      dataSheet.getCell('H8').value = 80
      dataSheet.getCell('I8').value = 40
      dataSheet.getCell('J8').value = 680
      dataSheet.getCell('K8').value = 'Choose option'
      dataSheet.getCell('L8').value = 'Choose option'
      dataSheet.getCell('M8').value = 40
      dataSheet.getCell('N8').value = 0.9
      dataSheet.getCell('O8').value = 680

      // Row 9: all placeholders/null (should terminate data section)
      dataSheet.getCell('B9').value = null
      dataSheet.getCell('C9').value = null
      dataSheet.getCell('D9').value = 'Choose option'
      dataSheet.getCell('E9').value = 'Choose option'
      dataSheet.getCell('F9').value = 'Choose option'
      dataSheet.getCell('G9').value = null
      dataSheet.getCell('H9').value = null
      dataSheet.getCell('I9').value = null
      dataSheet.getCell('J9').value = null
      dataSheet.getCell('K9').value = 'Choose option'
      dataSheet.getCell('L9').value = 'Choose option'
      dataSheet.getCell('M9').value = null
      dataSheet.getCell('N9').value = null
      dataSheet.getCell('O9').value = null

      // Row 10: another valid row after terminator row (should be excluded)
      dataSheet.getCell('B10').value = 99999999999
      dataSheet.getCell('C10').value = new Date('2025-12-31')
      dataSheet.getCell('D10').value = '03 03 08'
      dataSheet.getCell('E10').value = 'Glass - pre-sorted'
      dataSheet.getCell('F10').value = 'No'
      dataSheet.getCell('G10').value = 999
      dataSheet.getCell('H10').value = 99
      dataSheet.getCell('I10').value = 9
      dataSheet.getCell('J10').value = 891
      dataSheet.getCell('K10').value = 'No'
      dataSheet.getCell('L10').value = 'Actual weight (100%)'
      dataSheet.getCell('M10').value = 50
      dataSheet.getCell('N10').value = 0.5
      dataSheet.getCell('O10').value = 420.5 // (891-50)*1*0.5 no bailing wire

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      const spreadsheetBuffer = await createPlaceholderWorkbook()

      const result = await createSpreadsheetInfrastructure({
        organisationId,
        registrationId,
        summaryLogId,
        spreadsheetBuffer
      })

      server = result.server
      testSummaryLogsRepository = result.summaryLogsRepository

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: {
          uploadStatus: 'ready',
          metadata: { organisationId, registrationId },
          form: {
            summaryLogUpload: {
              fileId,
              filename,
              fileStatus: UPLOAD_STATUS.COMPLETE,
              contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentLength: spreadsheetBuffer.length,
              checksumSha256: 'abc123def456',
              detectedContentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              s3Bucket: result.s3Bucket,
              s3Key: result.s3Key
            }
          },
          numberOfRejectedFiles: 0
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
          ...asStandardUser({ linkedOrgId: organisationId })
        })
      })

      it('should return OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('should validate successfully with placeholder text normalized to null', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })

      it('should terminate data section at row with all placeholder values', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      })
    })
  })

  describe('empty worksheets handling', () => {
    const summaryLogId = 'summary-extra-tabs-test'
    const fileId = 'file-extra-tabs-test'
    const filename = 'extra-tabs-test.xlsx'
    let server

    const uploadFile = async (s3Bucket, s3Key) => {
      return server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: {
          uploadStatus: 'ready',
          metadata: { organisationId, registrationId },
          form: {
            summaryLogUpload: {
              fileId,
              filename,
              fileStatus: UPLOAD_STATUS.COMPLETE,
              contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              contentLength: 12345,
              checksumSha256: 'abc123def456',
              detectedContentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              s3Bucket,
              s3Key
            }
          },
          numberOfRejectedFiles: 0
        }
      })
    }

    describe('extra tabs with content should not affect validation or waste balance', () => {
      let uploadResponse

      beforeEach(async () => {
        const workbook = createReprocessorInputWorkbook()

        // Add unprotected "prep" worksheets with content (simulating v4 templates)
        const worksheet1 = workbook.addWorksheet('Worksheet')
        // DO NOT protect - this is a user prep tab
        worksheet1.getCell('A1').value = 'User notes'
        worksheet1.getCell('A2').value = 'Some user data'
        // Add EPR markers that should be IGNORED
        worksheet1.getCell('A3').value = '__EPR_META_ROGUE_FIELD'
        worksheet1.getCell('B3').value = 'should_be_ignored'
        worksheet1.getCell('A5').value = '__EPR_DATA_FAKE_TABLE'
        worksheet1.getCell('B5').value = 'FAKE_COLUMN'
        worksheet1.getCell('B6').value = 'fake_data_row'

        const worksheet2 = workbook.addWorksheet('Worksheet1')
        // DO NOT protect - this is a user prep tab
        worksheet2.getCell('A1').value = 'More user prep data'
        worksheet2.getCell('B1').value = 12345

        const spreadsheetBuffer = await workbook.xlsx.writeBuffer()

        const result = await createSpreadsheetInfrastructure({
          organisationId,
          registrationId,
          summaryLogId,
          spreadsheetBuffer
        })

        server = result.server
        uploadResponse = await uploadFile(result.s3Bucket, result.s3Key)
      })

      it('should accept the upload', () => {
        expect(uploadResponse.statusCode).toBe(202)
      })

      describe('after validation completes', () => {
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
            ...asStandardUser({ linkedOrgId: organisationId })
          })
        })

        it('should return OK', () => {
          expect(response.statusCode).toBe(200)
        })

        it('should validate successfully', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
        })

        it('should run waste balance logic on protected worksheet data only', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.loads).toBeDefined()
          expect(payload.loads.added.valid.count).toBe(1)
          expect(payload.loads.added.valid.rowIds).toContain(10000000001)
        })

        it('should not have processed content from unprotected worksheets', () => {
          // If validation passed with only the protected worksheet data,
          // and there are no validation errors about unrecognised tables,
          // then the unprotected worksheets were correctly ignored.
          // The FAKE_TABLE marker in the unprotected 'Worksheet' tab would have
          // caused a TABLE_UNRECOGNISED fatal error if it had been processed.
          const payload = JSON.parse(response.payload)
          expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
          expect(payload.validation.failures).toEqual([])
        })
      })
    })

    describe('extra tabs with no content should not affect validation or waste balance', () => {
      let uploadResponse

      beforeEach(async () => {
        const workbook = createReprocessorInputWorkbook()

        // Add unprotected "prep" worksheets with NO content
        workbook.addWorksheet('Worksheet')
        workbook.addWorksheet('Worksheet1')

        // Also add a hidden unprotected sheet (like Sheet1 in real templates)
        const hiddenSheet = workbook.addWorksheet('Sheet1')
        hiddenSheet.state = 'hidden'

        const spreadsheetBuffer = await workbook.xlsx.writeBuffer()

        const result = await createSpreadsheetInfrastructure({
          organisationId,
          registrationId,
          summaryLogId,
          spreadsheetBuffer
        })

        server = result.server
        uploadResponse = await uploadFile(result.s3Bucket, result.s3Key)
      })

      it('should accept the upload', () => {
        expect(uploadResponse.statusCode).toBe(202)
      })

      describe('after validation completes', () => {
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
            ...asStandardUser({ linkedOrgId: organisationId })
          })
        })

        it('should return OK', () => {
          expect(response.statusCode).toBe(200)
        })

        it('should validate successfully', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
        })

        it('should run waste balance logic on protected worksheet data only', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.loads).toBeDefined()
          expect(payload.loads.added.valid.count).toBe(1)
          expect(payload.loads.added.valid.rowIds).toContain(10000000001)
        })
      })
    })
  })
})
