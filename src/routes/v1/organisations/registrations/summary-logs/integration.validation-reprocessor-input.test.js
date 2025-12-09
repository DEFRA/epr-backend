import { createEmptyLoadValidity } from '#application/summary-logs/classify-loads.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  validToken,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  pollForValidation,
  createStandardMeta,
  createTestInfrastructure
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
                    [
                      999,
                      'invalid-date',
                      'bad-ewc-code',
                      1000,
                      100,
                      50,
                      850,
                      'YES',
                      'WEIGHT',
                      50,
                      0.85,
                      850
                    ]
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
          ),
          headers: {
            Authorization: `Bearer ${validToken}`
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
            headers: {
              Authorization: `Bearer ${validToken}`
            }
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

        it('should persist both fatal and error severity issues', async () => {
          const { summaryLog } =
            await summaryLogsRepository.findById(summaryLogId)

          expect(summaryLog.validation).toBeDefined()
          expect(summaryLog.validation.issues.length).toBeGreaterThan(1)

          const fatalErrors = summaryLog.validation.issues.filter(
            (i) => i.severity === 'fatal'
          )
          expect(fatalErrors).toHaveLength(1)
          expect(fatalErrors[0].message).toContain('ROW_ID')

          const errors = summaryLog.validation.issues.filter(
            (i) => i.severity === 'error'
          )
          expect(errors).toHaveLength(2)
          const errorHeaders = errors.map((e) => e.context.location?.header)
          expect(errorHeaders).toContain('DATE_RECEIVED_FOR_REPROCESSING')
          expect(errorHeaders).toContain('EWC_CODE')
        })

        it('should return fatal failures in HTTP response', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.validation.failures).toHaveLength(1)
          expect(payload.validation.failures[0].location.header).toBe('ROW_ID')
        })

        it('should return empty concerns in HTTP response', () => {
          const payload = JSON.parse(response.payload)
          expect(payload.validation.concerns).toEqual({})
        })
      })
    })

    describe('with invalid cell values (non-fatal errors)', () => {
      const summaryLogId = 'summary-data-syntax'
      const fileId = 'file-data-invalid'
      const filename = 'invalid-data.xlsx'

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
                    [
                      1000,
                      '2025-05-28T00:00:00.000Z',
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
                      1001,
                      'invalid-date',
                      'bad-code',
                      1000,
                      100,
                      50,
                      850,
                      'YES',
                      'WEIGHT',
                      50,
                      0.85,
                      850
                    ]
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
          ),
          headers: {
            Authorization: `Bearer ${validToken}`
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
            headers: {
              Authorization: `Bearer ${validToken}`
            }
          })
        })

        it('should return OK', () => {
          expect(response.statusCode).toBe(200)
        })

        it('should return validated status (not invalid) because data errors are not fatal', () => {
          const payload = JSON.parse(response.payload)
          expect(payload).toMatchObject({
            status: SUMMARY_LOG_STATUS.VALIDATED
          })
          expect(payload.validation).toBeDefined()
          expect(payload.validation.concerns).toBeDefined()
          expect(
            payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING
          ).toBeDefined()
          expect(
            payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows
              .length
          ).toBeGreaterThan(0)
        })

        it('should persist data validation errors with row context', async () => {
          const { summaryLog } =
            await summaryLogsRepository.findById(summaryLogId)

          expect(summaryLog.validation).toBeDefined()
          expect(summaryLog.validation.issues).toHaveLength(2)

          expect(
            summaryLog.validation.issues.every(
              (i) => i.context.location?.row === 9
            )
          ).toBe(true)

          const errorFields = summaryLog.validation.issues.map(
            (i) => i.context.location?.header
          )
          expect(errorFields).toContain('DATE_RECEIVED_FOR_REPROCESSING')
          expect(errorFields).toContain('EWC_CODE')

          expect(
            summaryLog.validation.issues.every((i) => i.severity === 'error')
          ).toBe(true)
        })

        it('should return issues in HTTP response format matching ADR 0020', () => {
          const payload = JSON.parse(response.payload)

          expect(
            payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING
          ).toBeDefined()
          expect(
            payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.sheet
          ).toBe('Received')
          expect(
            payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows
          ).toHaveLength(1)

          const rowWithIssues =
            payload.validation.concerns.RECEIVED_LOADS_FOR_REPROCESSING.rows[0]
          expect(rowWithIssues.row).toBe(9)
          expect(rowWithIssues.issues).toHaveLength(2)

          const dateIssue = rowWithIssues.issues.find(
            (issue) => issue.header === 'DATE_RECEIVED_FOR_REPROCESSING'
          )
          expect(dateIssue).toMatchObject({
            type: 'error',
            code: expect.any(String),
            header: 'DATE_RECEIVED_FOR_REPROCESSING',
            column: 'C',
            actual: 'invalid-date'
          })

          rowWithIssues.issues.forEach((issue) => {
            expect(issue).toHaveProperty('type')
            expect(issue).toHaveProperty('code')
            expect(issue).toHaveProperty('header')
            expect(issue).toHaveProperty('column')
          })
        })

        it('should return rowsWithIssues calculated on-the-fly in HTTP response', () => {
          const payload = JSON.parse(response.payload)

          const rowsWithIssues = Object.values(
            payload.validation.concerns
          ).reduce((total, table) => total + table.rows.length, 0)

          expect(rowsWithIssues).toBe(1)
        })

        it('should return loads with rowIds classifying loads as added/valid/invalid', () => {
          const payload = JSON.parse(response.payload)

          expect(payload.loads).toEqual({
            added: {
              valid: { count: 1, rowIds: [1000] },
              invalid: { count: 1, rowIds: [1001] },
              included: { count: 1, rowIds: [1000] },
              excluded: { count: 1, rowIds: [1001] }
            },
            unchanged: createEmptyLoadValidity(),
            adjusted: createEmptyLoadValidity()
          })
        })
      })
    })
  })
})
