import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asOperator,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  pollForValidation,
  createStandardMeta,
  createTestInfrastructure,
  setupWasteBalanceIntegrationEnvironment,
  REPROCESSED_LOADS_HEADERS,
  createReprocessedRowValues,
  servedTestRegistration,
  TEST_ORGANISATION_NUMBER,
  TEST_REGISTRATION_NUMBER
} from './integration-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import {Organisation} from '#domain/organisations/model.js' */

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
                      'ADD_PRODUCT_WEIGHT',
                      'PRODUCT_DESCRIPTION',
                      'END_OF_WASTE_STANDARDS',
                      'WEIGHBRIDGE_TICKET_NUMBER',
                      'HAULIER_NAME',
                      'HAULIER_VEHICLE_REGISTRATION_NUMBER',
                      'CUSTOMER_NAME',
                      'CUSTOMER_INVOICE_REFERENCE'
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
                          'Yes',
                          'Plastic pellets',
                          'Yes',
                          'WB123',
                          'Haulier A',
                          'AB12 CDE',
                          'Customer A',
                          'INV123'
                        ]
                      }
                    ]
                  }
                }
              }
            },
            { reprocessingType: 'output' }
          )
          server = result.server
          summaryLogsRepository = result.summaryLogsRepository

          uploadResponse = await server.inject({
            method: 'POST',
            url: buildPostUrl(summaryLogId),
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
            await pollForValidation(server, summaryLogId)

            response = await server.inject({
              method: 'GET',
              url: buildGetUrl(summaryLogId),
              ...asOperator()
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
        url: buildPostUrl(summaryLogId),
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
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          ...asOperator()
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

  // The newly-named columns were added to requiredHeaders, so a file that omits
  // one is now fatally rejected where it previously passed through via
  // .unknown(true). This pins that contract: if the template ever drops one of
  // these columns, ingestion must surface it (HEADER_REQUIRED) rather than
  // silently accept it.
  describe('data syntax validation when a modelled column header is missing', () => {
    const summaryLogId = 'summary-missing-modelled-header'
    const fileId = 'file-missing-modelled-header'
    const filename = 'missing-modelled-header.xlsx'
    const OMITTED_HEADER = 'PRODUCT_DESCRIPTION'

    let server
    let response

    beforeEach(async () => {
      const omitIndex = REPROCESSED_LOADS_HEADERS.indexOf(OMITTED_HEADER)
      const headers = REPROCESSED_LOADS_HEADERS.filter(
        (_, i) => i !== omitIndex
      )
      const values = createReprocessedRowValues().filter(
        (_, i) => i !== omitIndex
      )

      const result = await createTestInfrastructure(
        organisationId,
        registrationId,
        {
          [fileId]: {
            meta: createStandardMeta('REPROCESSOR_OUTPUT'),
            data: {
              REPROCESSED_LOADS: {
                location: { sheet: 'Reprocessed', row: 7, column: 'B' },
                headers,
                rows: [{ rowNumber: 8, values }]
              }
            }
          }
        },
        { reprocessingType: 'output' }
      )
      server = result.server

      await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.COMPLETE,
          fileId,
          filename
        )
      })

      await pollForValidation(server, summaryLogId)

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        ...asOperator()
      })
    })

    it('rejects the file with a HEADER_REQUIRED fatal naming the omitted column', () => {
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.INVALID)
      expect(payload.validation.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'HEADER_REQUIRED',
            expected: OMITTED_HEADER
          })
        ])
      )
    })
  })

  describe('combined meta and data syntax validation', () => {
    const summaryLogId = 'summary-combined-errors'
    const fileId = 'file-combined-errors'
    const filename = 'combined-errors.xlsx'
    let uploadResponse
    let testSummaryLogsRepository

    beforeEach(async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      const testOrg = buildOrganisation({
        orgId: TEST_ORGANISATION_NUMBER,
        registrations: [
          servedTestRegistration({
            id: registrationId,
            material: 'paper',
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
            formSubmission: { id: registrationId, time: new Date() },
            submittedToRegulator: 'ea'
          })
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        /** @type {Organisation} */ (testOrg)
      ])()

      const summaryLogExtractor = createInMemorySummaryLogExtractor({
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
      })

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        summaryLogRowStatesRepository:
          createInMemorySummaryLogRowStatesRepository()(),
        ledgerRepository: createInMemoryLedgerRepository()(),
        overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
        summaryLogExtractor,
        logger: mockLogger,
        reportsService: /** @type {any} */ ({
          findPeriodicReports: async () => []
        })
      })
      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository,
          organisationsRepository: () => organisationsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        }
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId, { accredited: false }),
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
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          ...asOperator()
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

    beforeEach(async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      testSummaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      const testOrg = buildOrganisation({
        orgId: TEST_ORGANISATION_NUMBER,
        registrations: [
          servedTestRegistration({
            id: registrationId,
            material: 'aluminium',
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'input',
            accreditation: null
          })
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        /** @type {Organisation} */ (testOrg)
      ])()

      const summaryLogExtractor = createInMemorySummaryLogExtractor({
        [fileId]: {
          meta: {
            REGISTRATION_NUMBER: {
              value: TEST_REGISTRATION_NUMBER,
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
      })

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository: testSummaryLogsRepository,
        organisationsRepository,
        summaryLogRowStatesRepository:
          createInMemorySummaryLogRowStatesRepository()(),
        ledgerRepository: createInMemoryLedgerRepository()(),
        overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
        summaryLogExtractor,
        logger: mockLogger,
        reportsService: /** @type {any} */ ({
          findPeriodicReports: async () => []
        })
      })
      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository,
          organisationsRepository: () => organisationsRepository
        },
        workers: {
          summaryLogsWorker: { validate: validateSummaryLog }
        }
      })

      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId, { accredited: false }),
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
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          ...asOperator()
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
        url: buildPostUrl(summaryLogId),
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
        await pollForValidation(server, summaryLogId)

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId),
          ...asOperator()
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
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn()
      }
      summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.validated({
          organisationId,
          registrationId,
          validation: {},
          meta: { PROCESSING_TYPE: 'EXPORTER' }
        })
      )

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          organisationsRepository: createInMemoryOrganisationsRepository([
            /** @type {Organisation} */ (
              buildOrganisation({
                id: organisationId,
                orgId: TEST_ORGANISATION_NUMBER,
                registrations: [
                  servedTestRegistration({
                    id: registrationId,
                    wasteProcessingType: 'exporter'
                  })
                ]
              })
            )
          ])
        }
      })
    })

    it('should return OK with empty issues array when validation.issues is undefined', async () => {
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        ...asOperator()
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.validation).toEqual({
        failures: [],
        concerns: {},
        counts: { fatal: 0, error: 0, warning: 0, total: 0 }
      })
    })
  })

  describe('registered-only received loads with invalid fields', () => {
    const supplierColumns = {
      SUPPLIER_NAME: 'Supplier Co',
      SUPPLIER_ADDRESS: '1 High St',
      SUPPLIER_POSTCODE: 'SW1A 1AA',
      SUPPLIER_EMAIL: 'supplier@example.com',
      SUPPLIER_PHONE_NUMBER: '01234567',
      ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorting'
    }

    it.each([
      {
        processingType: 'REPROCESSOR_REGISTERED_ONLY',
        registrationType: 'reprocessor',
        table: 'RECEIVED_LOADS_FOR_REPROCESSING',
        monthHeader: 'MONTH_RECEIVED_FOR_REPROCESSING',
        tonnageHeader: 'TONNAGE_RECEIVED_FOR_RECYCLING'
      },
      {
        processingType: 'EXPORTER_REGISTERED_ONLY',
        registrationType: 'exporter',
        table: 'RECEIVED_LOADS_FOR_EXPORT',
        monthHeader: 'MONTH_RECEIVED_FOR_EXPORT',
        tonnageHeader: 'TONNAGE_RECEIVED_FOR_EXPORT'
      }
    ])(
      'reports each bad cell of a $processingType row, then refuses to submit the invalid log',
      async ({
        processingType,
        registrationType,
        table,
        monthHeader,
        tonnageHeader
      }) => {
        const env = await setupWasteBalanceIntegrationEnvironment({
          processingType: registrationType,
          accredited: false
        })
        const summaryLogId = `summary-${processingType}-invalid`
        const fileId = `file-${processingType}-invalid`
        const row = {
          ROW_ID: 1001,
          [monthHeader]: '30-06-2025',
          NET_WEIGHT: -1,
          HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'invalid',
          RECYCLABLE_PROPORTION_PERCENTAGE: 1.22,
          [tonnageHeader]: -18.5,
          ...supplierColumns
        }
        const { ACCREDITATION_NUMBER: _noAccreditation, ...accreditedMeta } =
          createStandardMeta(processingType)
        env.fileDataMap[fileId] = {
          meta: {
            ...accreditedMeta,
            TEMPLATE_VERSION: {
              value: 2.1,
              location: { sheet: 'Cover', row: 4, column: 'B' }
            }
          },
          data: {
            [table]: {
              location: { sheet: 'Received', row: 7, column: 'A' },
              headers: Object.keys(row),
              rows: [{ rowNumber: 8, values: Object.values(row) }]
            }
          }
        }

        await env.server.inject({
          method: 'POST',
          url: buildPostUrl(summaryLogId, { accredited: false }),
          payload: createUploadPayload(
            env.organisationId,
            env.registrationId,
            UPLOAD_STATUS.COMPLETE,
            fileId,
            'registered-only-invalid.xlsx'
          )
        })
        await pollForValidation(env.server, summaryLogId)

        const checkPage = JSON.parse(
          (
            await env.server.inject({
              method: 'GET',
              url: buildGetUrl(summaryLogId),
              ...asOperator()
            })
          ).payload
        )
        expect(checkPage.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(
          checkPage.validation.failures.map(({ code, location }) => ({
            code,
            header: location.header
          }))
        ).toEqual([
          { code: 'INVALID_FORMAT', header: monthHeader },
          { code: 'VALUE_OUT_OF_RANGE', header: 'NET_WEIGHT' },
          {
            code: 'INVALID_TYPE',
            header: 'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION'
          },
          {
            code: 'VALUE_OUT_OF_RANGE',
            header: 'RECYCLABLE_PROPORTION_PERCENTAGE'
          },
          { code: 'VALUE_OUT_OF_RANGE', header: tonnageHeader }
        ])

        const submitResponse = await env.server.inject({
          method: 'POST',
          url: buildSubmitUrl(summaryLogId),
          ...asOperator()
        })
        expect(submitResponse.statusCode).toBe(409)
        expect(JSON.parse(submitResponse.payload).message).toBe(
          'Summary log must be validated before submission. Current status: invalid'
        )
      }
    )
  })
})
