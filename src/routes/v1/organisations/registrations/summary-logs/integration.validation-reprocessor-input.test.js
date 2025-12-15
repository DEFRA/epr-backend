import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createReprocessorInputWorkbook,
  createSpreadsheetInfrastructure
} from './integration-test-helpers.js'

describe('REPROCESSOR_INPUT data syntax validation', () => {
  let organisationId
  let registrationId

  setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()
  })

  describe('RECEIVED_LOADS_FOR_REPROCESSING table', () => {
    describe('with invalid fields (fatal error)', () => {
      const summaryLogId = 'summary-invalid-row-id'
      const fileId = 'file-invalid-row-id'
      const filename = 'invalid-row-id.xlsx'

      let server
      let summaryLogsRepository
      let uploadResponse

      const createInvalidFieldsWorkbook = async () => {
        const workbook = createReprocessorInputWorkbook()
        const dataSheet = workbook.getWorksheet('Data')

        // Overwrite valid row 7 with invalid values
        dataSheet.getCell('B7').value = 999 // Invalid ROW_ID (too small)
        dataSheet.getCell('C7').value = 'invalid-date' // Invalid date
        dataSheet.getCell('D7').value = 'bad-ewc-code' // Invalid EWC code
        dataSheet.getCell('L7').value = 'INVALID_METHOD' // Invalid HOW_DID_YOU value

        return workbook.xlsx.writeBuffer()
      }

      beforeEach(async () => {
        const spreadsheetBuffer = await createInvalidFieldsWorkbook()

        const result = await createSpreadsheetInfrastructure({
          organisationId,
          registrationId,
          summaryLogId,
          spreadsheetBuffer
        })

        server = result.server
        summaryLogsRepository = result.summaryLogsRepository

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
                contentLength: 12345,
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

      describe('retrieving summary log with fatal errors', () => {
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

        it('should return invalid status due to fatal errors', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.status).toBe(SUMMARY_LOG_STATUS.INVALID)
          expect(payload.validation.failures).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ code: 'VALUE_OUT_OF_RANGE' })
            ])
          )
        })

        it('should persist all issues as fatal severity (all fields now in fatalFields)', async () => {
          const { summaryLog } =
            await summaryLogsRepository.findById(summaryLogId)

          expect(summaryLog.validation).toBeDefined()
          // 4 fatal errors: ROW_ID, DATE_RECEIVED, EWC_CODE, HOW_DID_YOU_CALCULATE
          expect(summaryLog.validation.issues).toHaveLength(4)

          const fatalErrors = summaryLog.validation.issues.filter(
            (i) => i.severity === 'fatal'
          )
          expect(fatalErrors).toHaveLength(4)
          const fatalHeaders = fatalErrors.map(
            (e) => e.context.location?.header
          )
          expect(fatalHeaders).toContain('ROW_ID')
          expect(fatalHeaders).toContain('DATE_RECEIVED_FOR_REPROCESSING')
          expect(fatalHeaders).toContain('EWC_CODE')
          expect(fatalHeaders).toContain(
            'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
          )

          // No non-fatal errors since all fields are in fatalFields
          const errors = summaryLog.validation.issues.filter(
            (i) => i.severity === 'error'
          )
          expect(errors).toHaveLength(0)
        })

        it('should return fatal failures in HTTP response', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.validation.failures).toHaveLength(4)
          const failureHeaders = payload.validation.failures.map(
            (f) => f.location?.header
          )
          expect(failureHeaders).toContain('ROW_ID')
          expect(failureHeaders).toContain('DATE_RECEIVED_FOR_REPROCESSING')
          expect(failureHeaders).toContain('EWC_CODE')
          expect(failureHeaders).toContain(
            'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
          )
        })

        it('should return empty concerns in HTTP response', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.validation.concerns).toEqual({})
        })
      })
    })

    describe('with invalid cell values (fatal errors in data)', () => {
      const summaryLogId = 'summary-data-syntax'
      const fileId = 'file-data-invalid'
      const filename = 'invalid-data.xlsx'

      let server
      let summaryLogsRepository
      let uploadResponse

      const createMixedValidInvalidWorkbook = async () => {
        const workbook = createReprocessorInputWorkbook()
        const dataSheet = workbook.getWorksheet('Data')

        // Row 7 is already valid from createReprocessorInputWorkbook
        // Update ROW_ID to be in valid range
        dataSheet.getCell('B7').value = 10000000001

        // Add second row (row 8) with invalid EWC code
        dataSheet.getCell('B8').value = 10000000002
        dataSheet.getCell('C8').value = new Date('2025-05-29')
        dataSheet.getCell('D8').value = 'bad-code' // Invalid EWC code
        dataSheet.getCell('E8').value = 'Glass - pre-sorted'
        dataSheet.getCell('F8').value = 'No'
        dataSheet.getCell('G8').value = 1000
        dataSheet.getCell('H8').value = 100
        dataSheet.getCell('I8').value = 50
        dataSheet.getCell('J8').value = 850
        dataSheet.getCell('K8').value = 'Yes'
        dataSheet.getCell('L8').value = 'Actual weight (100%)'
        dataSheet.getCell('M8').value = 50
        dataSheet.getCell('N8').value = 0.85
        dataSheet.getCell('O8').value = 678.98

        return workbook.xlsx.writeBuffer()
      }

      beforeEach(async () => {
        const spreadsheetBuffer = await createMixedValidInvalidWorkbook()

        const result = await createSpreadsheetInfrastructure({
          organisationId,
          registrationId,
          summaryLogId,
          spreadsheetBuffer
        })

        server = result.server
        summaryLogsRepository = result.summaryLogsRepository

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
                contentLength: 12345,
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

      describe('retrieving summary log with data errors', () => {
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

        it('should return invalid status because EWC_CODE validation errors are now fatal', () => {
          const payload = JSON.parse(response.payload)
          expect(payload).toMatchObject({
            status: SUMMARY_LOG_STATUS.INVALID
          })
          // Fatal errors return failures array, not concerns
          expect(payload.validation).toBeDefined()
          expect(payload.validation.failures).toBeDefined()
          expect(payload.validation.failures.length).toBeGreaterThan(0)
        })

        it('should persist data validation errors with row context and fatal severity', async () => {
          const { summaryLog } =
            await summaryLogsRepository.findById(summaryLogId)

          expect(summaryLog.validation).toBeDefined()
          expect(summaryLog.validation.issues).toHaveLength(1)

          expect(
            summaryLog.validation.issues.every(
              (i) => i.context.location?.row === 8
            )
          ).toBe(true)

          const errorFields = summaryLog.validation.issues.map(
            (i) => i.context.location?.header
          )
          expect(errorFields).toContain('EWC_CODE')

          // EWC_CODE is now in fatalFields so severity is 'fatal'
          expect(
            summaryLog.validation.issues.every((i) => i.severity === 'fatal')
          ).toBe(true)
        })

        it('should return fatal failures in HTTP response format', () => {
          const payload = JSON.parse(response.payload)

          // Fatal errors appear in failures array
          expect(payload.validation.failures).toBeDefined()
          expect(payload.validation.failures.length).toBeGreaterThan(0)

          const ewcFailure = payload.validation.failures.find(
            (failure) => failure.location?.header === 'EWC_CODE'
          )
          expect(ewcFailure).toMatchObject({
            code: expect.any(String),
            location: {
              header: 'EWC_CODE',
              column: 'D',
              row: 8
            },
            actual: 'bad-code'
          })
        })

        it('should return empty concerns in HTTP response since all errors are fatal', () => {
          const payload = JSON.parse(response.payload)
          // When status is INVALID, concerns should be empty
          expect(payload.validation.concerns).toEqual({})
        })

        it('should not return loads when validation fails with fatal data error', () => {
          const payload = JSON.parse(response.payload)

          // Fatal errors prevent load classification
          expect(payload.loads).toBeUndefined()
        })
      })
    })
  })
})
