import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asStandardUser,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createStandardMeta,
  setupIntegrationEnvironment,
  createTestInfrastructure
} from './test-helpers/index.js'

describe('Advanced validation scenarios', () => {
  let server
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

        beforeEach(async () => {
          const env = await setupIntegrationEnvironment({
            organisationId,
            registrationId,
            reprocessingType: 'output',
            registrationNumber: 'REG-123',
            accreditationNumber: 'ACC-123',
            extractorData: {
              [fileId]: {
                meta: createStandardMeta('REPROCESSOR_OUTPUT'),
                data: {
                  REPROCESSED_LOADS: {
                    location: { sheet: 'Reprocessed', row: 7, column: 'B' },
                    headers: [
                      'ROW_ID',
                      'DATE_LOAD_LEFT_SITE',
                      'PRODUCT_TONNAGE',
                      'UK_PACKAGING_WEIGHT_PERCENTAGE',
                      'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
                      'ADD_PRODUCT_WEIGHT'
                    ],
                    rows: [
                      {
                        rowNumber: 8,
                        values: [
                          3000,
                          '2025-05-28T00:00:00.000Z',
                          1001,
                          0.5,
                          500.5,
                          'Yes'
                        ]
                      }
                    ]
                  }
                }
              }
            }
          })
          server = env.server
          summaryLogsRepository = env.summaryLogsRepository

          uploadResponse = await server.inject({
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

    beforeEach(async () => {
      const result = await createTestInfrastructure(
        organisationId,
        registrationId,
        {
          [fileId]: {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {
              RECEIVED_LOADS_FOR_REPROCESSING: {
                location: { sheet: 'Received', row: 7, column: 'B' },
                headers: ['ROW_ID', 'DATE_RECEIVED_FOR_REPROCESSING'],
                rows: [
                  { rowNumber: 8, values: [1000, '2025-05-28T00:00:00.000Z'] }
                ]
              }
            }
          }
        }
      )
      server = result.server
      summaryLogsRepository = result.summaryLogsRepository

      uploadResponse = await server.inject({
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
    let summaryLogsRepository

    beforeEach(async () => {
      const env = await setupIntegrationEnvironment({
        organisationId,
        registrationId,
        registrationNumber: 'REG-123',
        accreditationNumber: 'ACC-123',
        extractorData: {
          [fileId]: {
            meta: {
              PROCESSING_TYPE: {
                value: 'REPROCESSOR_INPUT',
                location: { sheet: 'Cover', row: 2, column: 'B' }
              },
              MATERIAL: {
                value: 'Paper_and_board',
                location: { sheet: 'Cover', row: 3, column: 'B' }
              },
              TEMPLATE_VERSION: {
                value: 5,
                location: { sheet: 'Cover', row: 4, column: 'B' }
              }
            },
            data: {
              RECEIVED_LOADS_FOR_REPROCESSING: {
                location: { sheet: 'Received', row: 7, column: 'B' },
                headers: [
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
                ],
                rows: [
                  {
                    rowNumber: 8,
                    values: [
                      999,
                      'invalid-date',
                      '03 03 08',
                      1000,
                      100,
                      50,
                      850,
                      true,
                      'WEIGHT',
                      50,
                      0.85,
                      850
                    ]
                  }
                ]
              }
            }
          }
        }
      })
      server = env.server
      summaryLogsRepository = env.summaryLogsRepository

      uploadResponse = await server.inject({
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
          await summaryLogsRepository.findById(summaryLogId)

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
          await summaryLogsRepository.findById(summaryLogId)

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
    let summaryLogsRepository

    beforeEach(async () => {
      const env = await setupIntegrationEnvironment({
        organisationId,
        registrationId,
        registrationNumber: 'REG12345',
        accreditationNumber: null,
        extractorData: {
          [fileId]: {
            meta: {
              REGISTRATION_NUMBER: {
                value: 'REG12345',
                location: { sheet: 'Cover', row: 1, column: 'B' }
              },
              PROCESSING_TYPE: {
                value: 'REPROCESSOR_INPUT',
                location: { sheet: 'Cover', row: 2, column: 'B' }
              },
              MATERIAL: {
                value: 'Aluminium',
                location: { sheet: 'Cover', row: 3, column: 'B' }
              }
            },
            data: {
              RECEIVED_LOADS_FOR_REPROCESSING: {
                location: { sheet: 'Received', row: 7, column: 'B' },
                headers: ['INVALID_HEADER'],
                rows: [
                  {
                    rowNumber: 8,
                    values: [
                      999,
                      'invalid-date',
                      'bad-code',
                      'not-a-number',
                      'YES',
                      'WEIGHT',
                      50,
                      0.85,
                      850
                    ]
                  }
                ]
              }
            }
          }
        }
      })
      server = env.server
      summaryLogsRepository = env.summaryLogsRepository

      uploadResponse = await server.inject({
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
          await summaryLogsRepository.findById(summaryLogId)

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

    beforeEach(async () => {
      const result = await createTestInfrastructure(
        organisationId,
        registrationId,
        {
          [fileId]: {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {
              UNKNOWN_FUTURE_TABLE: {
                location: { sheet: 'Unknown', row: 1, column: 'A' },
                headers: ['ANYTHING', 'GOES', 'HERE'],
                rows: [
                  { rowNumber: 2, values: ['foo', 'bar', 'baz'] },
                  { rowNumber: 3, values: ['invalid', 123, true] }
                ]
              }
            }
          }
        }
      )
      server = result.server
      summaryLogsRepository = result.summaryLogsRepository

      uploadResponse = await server.inject({
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
    let summaryLogsRepository
    let server

    beforeEach(async () => {
      const env = await setupIntegrationEnvironment({
        organisationId,
        registrationId
      })
      server = env.server
      summaryLogsRepository = env.summaryLogsRepository

      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.validated({
          organisationId,
          registrationId,
          validation: {}
        })
      )
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
