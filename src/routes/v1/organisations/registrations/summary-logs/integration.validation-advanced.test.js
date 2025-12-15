import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createReprocessorInputWorkbook,
  createReprocessorOutputWorkbook,
  createSpreadsheetInfrastructure
} from './integration-test-helpers.js'

describe('Advanced validation scenarios', () => {
  let organisationId
  let registrationId

  setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()
  })

  describe('REPROCESSOR_OUTPUT data syntax validation', () => {
    describe('REPROCESSED_LOADS table', () => {
      describe('with invalid fields (fatal error)', () => {
        const summaryLogId = 'summary-reprocessor-output-fatal'
        const fileId = 'file-reprocessor-output-fatal'
        const filename = 'reprocessor-output-fatal.xlsx'

        let server
        let summaryLogsRepository
        let uploadResponse

        const createInvalidReprocessorOutputWorkbook = async () => {
          const workbook = createReprocessorOutputWorkbook()
          const dataSheet = workbook.getWorksheet('Data')

          // Overwrite PRODUCT_TONNAGE with invalid value (exceeds 1000 limit)
          dataSheet.getCell('D7').value = 1001

          return workbook.xlsx.writeBuffer()
        }

        beforeEach(async () => {
          const spreadsheetBuffer =
            await createInvalidReprocessorOutputWorkbook()

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

          it('should persist fatal error for invalid field', async () => {
            const { summaryLog } =
              await summaryLogsRepository.findById(summaryLogId)

            expect(summaryLog.validation).toBeDefined()
            expect(summaryLog.validation.issues.length).toBeGreaterThan(0)

            const fatalErrors = summaryLog.validation.issues.filter(
              (i) => i.severity === 'fatal'
            )
            expect(fatalErrors).toHaveLength(1)
            expect(fatalErrors[0].message).toContain('PRODUCT_TONNAGE')
          })

          it('should return fatal failures in HTTP response', () => {
            const payload = JSON.parse(response.payload)
            expect(payload.validation.failures).toHaveLength(1)
            expect(payload.validation.failures[0].location.header).toBe(
              'PRODUCT_TONNAGE'
            )
          })

          it('should return empty concerns in HTTP response', () => {
            const payload = JSON.parse(response.payload)
            expect(payload.validation.concerns).toEqual({})
          })
        })
      })
    })
  })

  describe('data syntax validation with missing required headers', () => {
    const summaryLogId = 'summary-missing-headers'
    const fileId = 'file-missing-headers'
    const filename = 'missing-headers.xlsx'

    let server
    let summaryLogsRepository
    let uploadResponse

    const createMissingHeadersWorkbook = async () => {
      const workbook = createReprocessorInputWorkbook()
      const dataSheet = workbook.getWorksheet('Data')

      // Clear all headers except first two
      for (let col = 4; col <= 15; col++) {
        dataSheet.getCell(6, col).value = null
      }

      // Clear corresponding data cells
      for (let col = 4; col <= 15; col++) {
        dataSheet.getCell(7, col).value = null
      }

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      const spreadsheetBuffer = await createMissingHeadersWorkbook()

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

    describe('retrieving summary log with fatal header errors', () => {
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

      it('should return invalid status with validation failures due to fatal errors', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.INVALID
        })
        expect(payload.validation.failures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'HEADER_REQUIRED' })
          ])
        )
      })

      it('should persist fatal validation errors in database', async () => {
        const { summaryLog } =
          await summaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues.length).toBeGreaterThan(0)

        const fatalErrors = summaryLog.validation.issues.filter(
          (i) => i.severity === 'fatal'
        )
        expect(fatalErrors.length).toBeGreaterThan(0)
        expect(fatalErrors[0].message).toContain('Missing required header')
        expect(fatalErrors[0].context.location).toBeDefined()
      })

      it('should return fatal issues in HTTP response format', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.validation).toBeDefined()
        expect(payload.validation.failures).toBeDefined()
        expect(payload.validation.failures.length).toBeGreaterThan(0)

        payload.validation.failures.forEach((failure) => {
          expect(failure).toHaveProperty('code')
          expect(failure).toHaveProperty('location')
        })

        expect(payload.validation.concerns).toEqual({})
      })
    })
  })

  describe('combined meta and data syntax validation', () => {
    const summaryLogId = 'summary-combined-errors'
    const fileId = 'file-combined-errors'
    const filename = 'combined-errors.xlsx'
    let uploadResponse
    let testSummaryLogsRepository
    let server

    const createMissingRegistrationNumberWorkbook = async () => {
      const workbook = createReprocessorInputWorkbook()
      const dataSheet = workbook.getWorksheet('Data')

      // Remove REGISTRATION_NUMBER metadata
      dataSheet.getCell('A1').value = null
      dataSheet.getCell('B1').value = null

      // Add invalid data that would fail data validation (to test short-circuit)
      dataSheet.getCell('B7').value = 999 // Invalid ROW_ID
      dataSheet.getCell('C7').value = 'invalid-date'

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      const spreadsheetBuffer = await createMissingRegistrationNumberWorkbook()

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

    describe('retrieving summary log with combined errors', () => {
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

      it('should return invalid status due to fatal meta error', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.INVALID
        })
      })

      it('should persist only meta errors due to short-circuit validation', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.validation).toBeDefined()
        expect(summaryLog.validation.issues.length).toBeGreaterThan(0)

        const metaErrors = summaryLog.validation.issues.filter(
          (i) => i.context.location?.field !== undefined
        )
        expect(metaErrors.length).toBeGreaterThan(0)
        expect(metaErrors[0].severity).toBe('fatal')

        const dataErrors = summaryLog.validation.issues.filter(
          (i) => i.context.location?.header !== undefined
        )
        expect(dataErrors.length).toBe(0)
      })

      it('should demonstrate short-circuit validation stops at fatal meta errors', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        const issues = summaryLog.validation.issues

        expect(
          issues.every((i) => i.context.location?.field !== undefined)
        ).toBe(true)
        expect(
          issues.some((i) => i.context.location?.header !== undefined)
        ).toBe(false)
      })
    })
  })

  describe('Level 1 validation (meta syntax) short-circuits entire pipeline', () => {
    const summaryLogId = 'summary-meta-syntax-fatal'
    const fileId = 'file-meta-syntax-fatal'
    const filename = 'meta-syntax-fatal.xlsx'
    let uploadResponse
    let testSummaryLogsRepository
    let server

    const createMissingTemplateVersionWorkbook = async () => {
      const workbook = createReprocessorInputWorkbook()
      const dataSheet = workbook.getWorksheet('Data')

      // Update registration number and material to match test org
      dataSheet.getCell('B1').value = 'REG12345'
      dataSheet.getCell('B3').value = 'Aluminium'

      // Remove TEMPLATE_VERSION metadata
      dataSheet.getCell('A4').value = null
      dataSheet.getCell('B4').value = null

      // Add invalid data and headers that would fail data validation
      // (to verify short-circuit prevents these from being checked)
      dataSheet.getCell('B7').value = 999
      dataSheet.getCell('C7').value = 'invalid-date'
      dataSheet.getCell('D7').value = 'bad-code'

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      const spreadsheetBuffer = await createMissingTemplateVersionWorkbook()

      const result = await createSpreadsheetInfrastructure({
        organisationId,
        registrationId,
        summaryLogId,
        spreadsheetBuffer,
        registration: {
          registrationNumber: 'REG12345',
          material: 'aluminium'
        }
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

    describe('retrieving summary log with meta syntax fatal error', () => {
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

      it('should return invalid status due to fatal meta syntax error', () => {
        const payload = JSON.parse(response.payload)
        expect(payload).toMatchObject({
          status: SUMMARY_LOG_STATUS.INVALID
        })
        expect(payload.validation.failures).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'TEMPLATE_VERSION_REQUIRED' })
          ])
        )
      })

      it('should return only meta syntax error (no meta business or data errors)', () => {
        const payload = JSON.parse(response.payload)

        expect(payload.validation).toBeDefined()
        expect(payload.validation.failures).toBeDefined()
        expect(payload.validation.failures.length).toBeGreaterThan(0)

        const metaSyntaxErrors = payload.validation.failures.filter(
          (f) => f.location?.field === 'TEMPLATE_VERSION'
        )
        expect(metaSyntaxErrors.length).toBeGreaterThan(0)

        expect(payload.validation.concerns).toEqual({})
      })

      it('should demonstrate Level 1 short-circuit: only meta syntax validation ran', async () => {
        const { summaryLog } =
          await testSummaryLogsRepository.findById(summaryLogId)

        const issues = summaryLog.validation.issues

        expect(
          issues.every((i) => i.context.location?.field !== undefined)
        ).toBe(true)

        expect(
          issues.some((i) => i.context.location?.header !== undefined)
        ).toBe(false)

        expect(issues.every((i) => i.severity === 'fatal')).toBe(true)
        expect(issues.every((i) => i.category === 'technical')).toBe(true)
      })
    })
  })

  describe('validation with tables that have no schema defined', () => {
    const summaryLogId = 'summary-no-schema'
    const fileId = 'file-no-schema'
    const filename = 'no-schema.xlsx'

    let server
    let summaryLogsRepository
    let uploadResponse

    const createUnrecognisedTableWorkbook = async () => {
      const workbook = createReprocessorInputWorkbook()
      const dataSheet = workbook.getWorksheet('Data')

      // Replace the known table marker with an unrecognised one
      dataSheet.getCell('A6').value = '__EPR_DATA_UNKNOWN_FUTURE_TABLE'

      // Update headers for this fake table
      dataSheet.getCell('B6').value = 'ANYTHING'
      dataSheet.getCell('C6').value = 'GOES'
      dataSheet.getCell('D6').value = 'HERE'

      // Clear remaining header cells
      for (let col = 5; col <= 15; col++) {
        dataSheet.getCell(6, col).value = null
      }

      // Update data row for fake table
      dataSheet.getCell('B7').value = 'foo'
      dataSheet.getCell('C7').value = 'bar'
      dataSheet.getCell('D7').value = 'baz'

      // Clear remaining data cells
      for (let col = 5; col <= 15; col++) {
        dataSheet.getCell(7, col).value = null
      }

      return workbook.xlsx.writeBuffer()
    }

    beforeEach(async () => {
      const spreadsheetBuffer = await createUnrecognisedTableWorkbook()

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

    describe('retrieving summary log with unrecognised tables', () => {
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

      it('should return invalid status with validation failure', () => {
        const payload = JSON.parse(response.payload)
        expect(payload.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(payload.validation).toBeDefined()
        expect(payload.validation.failures).toHaveLength(1)
        expect(payload.validation.failures[0].code).toBe('TABLE_UNRECOGNISED')
      })

      it('should reject tables without schemas with FATAL error', async () => {
        const { summaryLog } =
          await summaryLogsRepository.findById(summaryLogId)

        expect(summaryLog.validation.issues).toHaveLength(1)
        expect(summaryLog.validation.issues[0].severity).toBe('fatal')
        expect(summaryLog.validation.issues[0].code).toBe('TABLE_UNRECOGNISED')
        expect(summaryLog.validation.issues[0].message).toContain(
          'UNKNOWN_FUTURE_TABLE'
        )
      })
    })
  })

  describe('edge case: validation object without issues array', () => {
    const summaryLogId = 'summary-no-issues-array'
    let summaryLogsRepositoryFactory
    let summaryLogsRepository
    let server

    beforeEach(async () => {
      summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
      }
      summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        organisationId,
        registrationId,
        file: {
          id: 'file-123',
          name: 'test.xlsx',
          status: UPLOAD_STATUS.COMPLETE,
          uri: '/uploads/file-123',
          s3: {
            bucket: 'test-bucket',
            key: 'test-key'
          }
        },
        validation: {}
      })

      const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory
        },
        featureFlags
      })
    })

    it('should return OK with empty issues array when validation.issues is undefined', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.validation).toEqual({
        failures: [],
        concerns: {}
      })
    })
  })
})
