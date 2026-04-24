import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { reportsPostPath } from './post.js'
import * as reportAudit from '#reports/application/audit.js'

vi.mock('#reports/application/audit.js', () => ({
  auditReportCreate: vi.fn().mockResolvedValue(undefined)
}))

describe(`POST ${reportsPostPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}`

  describe('when feature flag is enabled', () => {
    const createServer = async (registrationOverrides = {}) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository([
          {
            id: new ObjectId().toString(),
            organisationId: org.id,
            registrationId: registration.id,
            type: 'received',
            data: {},
            versions: [
              {
                createdAt: '2024-01-15T00:00:00.000Z',
                summaryLog: { id: 'sl-1' }
              }
            ]
          }
        ])
      const reportsRepositoryFactory = createInMemoryReportsRepository()

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: wasteRecordsRepositoryFactory,
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id,
        reportsRepositoryFactory
      }
    }

    const makeRequest = (
      server,
      orgId,
      regId,
      year = 2025,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'POST',
        url: makeUrl(orgId, regId, year, cadence, period),
        ...asStandardUser({ linkedOrgId: orgId })
      })

    it('returns 201 with created report including data sections', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(server, organisationId, registrationId)

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const payload = JSON.parse(response.payload)
      expect(payload.id).toBeDefined()
      expect(payload.status.currentStatus).toBe('in_progress')
      expect(payload.status.history).toStrictEqual([
        expect.objectContaining({
          status: 'in_progress',
          at: expect.any(String)
        })
      ])
      expect(payload.material).toBe('glass_re_melt')
      expect(payload.wasteProcessingType).toBe('reprocessor')
      expect(payload.details.material).toBe('glass')
      expect(payload.details.site).toBeDefined()
      expect(payload.recyclingActivity).toStrictEqual({
        suppliers: [],
        totalTonnageReceived: 0,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      })
      expect(payload.wasteSent).toStrictEqual({
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite: 0,
        finalDestinations: []
      })
      expect(payload.exportActivity).toBeUndefined()
    })

    it('returns 409 with structured existingReport when a report for the same period already exists', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const first = await makeRequest(server, organisationId, registrationId)
      const firstPayload = JSON.parse(first.payload)
      const response = await makeRequest(server, organisationId, registrationId)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.CONFLICT,
        error: 'Conflict',
        message: 'Report already exists for quarterly period 1 of 2025',
        existingReport: {
          id: firstPayload.id,
          cadence: 'quarterly',
          period: 1,
          year: 2025
        }
      })
    })

    it('returns 404 when registration not found', async () => {
      const { server, organisationId } = await createServer()
      const unknownRegId = new ObjectId().toString()

      const response = await makeRequest(server, organisationId, unknownRegId)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('creates report for non-glass material registration', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'exporter',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        1
      )

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const payload = JSON.parse(response.payload)
      expect(payload.material).toBe('plastic')
    })

    it('returns 400 with structured invalidPeriod when period exceeds the cadence range', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        5
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Invalid period 5 for cadence quarterly',
        invalidPeriod: {
          actual: 5,
          cadence: 'quarterly',
          validPeriods: [1, 2, 3, 4]
        }
      })
    })

    it('returns 400 with structured periodNotEnded when the period has not yet ended', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2099,
        'quarterly',
        1
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Cannot create report for period 1 — period has not yet ended',
        periodNotEnded: {
          period: 1,
          cadence: 'quarterly',
          endDate: '2099-03-31',
          earliestSubmissionDate: '2099-04-01T00:00:00.000Z'
        }
      })
    })

    it('returns 400 with structured cadence when accredited registration uses quarterly cadence', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: new ObjectId().toString()
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        1
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message:
          "Cadence 'quarterly' does not match registration type — expected 'monthly'",
        cadence: { actual: 'quarterly', expected: 'monthly' }
      })
    })

    it('returns 400 with structured cadence when registered-only registration uses monthly cadence', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'monthly',
        1
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message:
          "Cadence 'monthly' does not match registration type — expected 'quarterly'",
        cadence: { actual: 'monthly', expected: 'quarterly' }
      })
    })

    describe('4xx access log shape for cadence mismatch', () => {
      afterEach(() => {
        config.reset('featureFlags.allowFullErrorOutput')
      })

      it.each([
        {
          name: 'without allowFullErrorOutput — err field is undefined',
          flag: false,
          assertErr: (accessLog) => {
            expect(accessLog.err).toBeUndefined()
          }
        },
        {
          name: 'with allowFullErrorOutput — err carries the curated payload including cadence detail',
          flag: true,
          assertErr: (accessLog) => {
            expect(accessLog.err).toEqual({
              statusCode: StatusCodes.BAD_REQUEST,
              error: 'Bad Request',
              message:
                "Cadence 'monthly' does not match registration type — expected 'quarterly'",
              cadence: { actual: 'monthly', expected: 'quarterly' }
            })
          }
        }
      ])('$name', async ({ flag, assertErr }) => {
        config.set('featureFlags.allowFullErrorOutput', flag)

        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        await makeRequest(
          server,
          organisationId,
          registrationId,
          2025,
          'monthly',
          1
        )

        const accessLogCall = server.loggerMocks.info.mock.calls.find(
          ([entry]) => entry?.res?.statusCode === 400
        )

        expect(accessLogCall).toBeDefined()
        assertErr(accessLogCall[0])
      })
    })

    it('returns 422 for invalid cadence', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId, 2025, 'biweekly', 1),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    describe('error handling', () => {
      beforeEach(() => vi.clearAllMocks())

      it('logs error details when an unexpected error occurs', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const unexpectedError = new Error('unexpected failure')
        reportAudit.auditReportCreate.mockRejectedValueOnce(unexpectedError)

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
        expect(server.loggerMocks.error).toHaveBeenCalledWith(
          expect.objectContaining({
            err: unexpectedError,
            message: `Failure on ${reportsPostPath}`,
            event: {
              category: LOGGING_EVENT_CATEGORIES.SERVER,
              action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
            },
            http: {
              response: {
                status_code: StatusCodes.INTERNAL_SERVER_ERROR
              }
            }
          })
        )
      })

      it('does not log when an expected Boom error is thrown', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        await makeRequest(server, organisationId, registrationId)
        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(server.loggerMocks.error).not.toHaveBeenCalled()
        expect(server.loggerMocks.warn).not.toHaveBeenCalled()
      })
    })

    describe('auditing', () => {
      beforeEach(() => vi.clearAllMocks())

      it('calls auditReportCreate with correct params on success', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        await makeRequest(server, organisationId, registrationId)

        expect(reportAudit.auditReportCreate).toHaveBeenCalledWith(
          expect.any(Object),
          {
            organisationId,
            registrationId,
            year: 2025,
            cadence: 'quarterly',
            period: 1,
            submissionNumber: expect.anything(),
            reportId: expect.any(String),
            createdAt: expect.any(String)
          }
        )
      })
    })

    it('includes prn issuedTonnage when creating report for accredited registration', async () => {
      const accreditationId = new ObjectId().toString()
      const issuedAt = new Date('2025-01-15T00:00:00.000Z')

      const prn = {
        ...buildAwaitingAcceptancePrn({
          accreditation: {
            id: accreditationId,
            accreditationNumber: 'ACC-TEST-001',
            accreditationYear: 2025,
            material: 'glass_re_melt',
            submittedToRegulator: 'ea',
            siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
          },
          tonnage: 250,
          status: {
            issued: {
              at: issuedAt,
              by: { id: 'issuer', name: 'Issuer', position: 'Manager' }
            }
          }
        }),
        id: new ObjectId().toString()
      }

      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor',
        accreditationId
      })
      const org = buildOrganisation({ registrations: [registration] })
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: createInMemoryWasteRecordsRepository([
            {
              id: new ObjectId().toString(),
              organisationId: org.id,
              registrationId: registration.id,
              type: 'received',
              data: {},
              versions: [
                {
                  createdAt: '2024-01-15T00:00:00.000Z',
                  summaryLog: { id: 'sl-1' }
                }
              ]
            }
          ]),
          reportsRepository: createInMemoryReportsRepository(),
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([prn])
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(org.id, registration.id, 2025, 'monthly', 1),
        ...asStandardUser({ linkedOrgId: org.id })
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      const payload = JSON.parse(response.payload)
      expect(payload.prn).toStrictEqual({ issuedTonnage: 250 })
    })
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const server = await createTestServer({
        repositories: {},
        featureFlags: createInMemoryFeatureFlags({ reports: false })
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId, 2025, 'quarterly', 1),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
