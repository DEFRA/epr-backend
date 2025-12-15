import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asStandardUser,
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
                    // Waste balance fields (Section 1)
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
                    // Supplementary fields (Sections 2 & 3)
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
                  ],
                  rows: [
                    {
                      rowNumber: 8,
                      values: [
                        999,
                        'invalid-date',
                        'bad-ewc-code',
                        'Glass - pre-sorted',
                        'No',
                        1000,
                        100,
                        50,
                        850,
                        'Yes',
                        'INVALID_METHOD', // Invalid HOW_DID_YOU value - causes fatal error
                        50,
                        0.85,
                        678.98, // (850-50)*0.9985*0.85 with bailing wire deduction
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
          // Now 4 fatal errors: ROW_ID, DATE_RECEIVED, EWC_CODE, HOW_DID_YOU_CALCULATE
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
                    // Waste balance fields (Section 1)
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
                    // Supplementary fields (Sections 2 & 3)
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
                  ],
                  rows: [
                    {
                      rowNumber: 8,
                      values: [
                        1000,
                        '2025-05-28T00:00:00.000Z',
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
                        678.98, // (850-50)*0.9985*0.85 with bailing wire deduction
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
                        1001,
                        '2025-05-29T00:00:00.000Z',
                        'bad-code', // Invalid EWC code - now causes fatal error
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
                        678.98, // (850-50)*0.9985*0.85 with bailing wire deduction
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
              (i) => i.context.location?.row === 9
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
              row: 9
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
