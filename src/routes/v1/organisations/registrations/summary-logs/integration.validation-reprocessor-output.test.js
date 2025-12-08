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

describe('REPROCESSOR_OUTPUT data syntax validation', () => {
  let organisationId
  let registrationId

  setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()
  })

  describe('REPROCESSED_LOADS table', () => {
    describe('with invalid fields (fatal error)', () => {
      const summaryLogId = 'summary-reprocessor-output-fatal'
      const fileId = 'file-reprocessor-output-fatal'
      const filename = 'reprocessor-output-fatal.xlsx'

      let server
      let summaryLogsRepository
      let uploadResponse

      beforeEach(async () => {
        const result = await createTestInfrastructure(
          organisationId,
          registrationId,
          {
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
                    [
                      3000, // Valid ROW_ID (minimum for REPROCESSED_LOADS)
                      '2025-05-28T00:00:00.000Z', // Valid date
                      1001, // Invalid PRODUCT_TONNAGE (above maximum 1000)
                      0.5, // Valid UK_PACKAGING_WEIGHT_PERCENTAGE
                      500.5, // Valid calculation (1001 × 0.5)
                      'Yes' // Valid ADD_PRODUCT_WEIGHT
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

        it('should persist fatal error for invalid field', async () => {
          const { summaryLog } =
            await summaryLogsRepository.findById(summaryLogId)

          expect(summaryLog.validation).toBeDefined()
          expect(summaryLog.validation.issues.length).toBeGreaterThan(0)

          // Should have fatal error for PRODUCT_TONNAGE
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
