import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach
} from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import { asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildPrnCreatedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { packagingRecyclingNotesCreatePath } from './post.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { createMockLogger } from '#test/mock-logger.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'
const accreditationId = 'acc-789'

const SEED_BALANCE = { amount: 500, availableAmount: 500 }

/**
 * An in-memory stream seeded with one summary-log submission, opening the
 * ledgerId's ledger at the given balance so the create route's pre-check
 * resolves against it. Passing `null` leaves the ledger absent, which resolves
 * to zero available.
 *
 * @param {{ amount: number, availableAmount: number } | null} [closingBalance]
 */
const seedStream = (closingBalance = SEED_BALANCE) =>
  createInMemoryLedgerRepository(
    closingBalance
      ? [
          partialMock(
            buildLedgerEvent({
              registrationId,
              accreditationId,
              organisationId,
              number: 1,
              payload: {
                summaryLogId: 'log-1',
                creditTotal: closingBalance.amount
              },
              openingBalance: { amount: 0, availableAmount: 0 },
              closingBalance
            })
          )
        ]
      : []
  )()

const validPayload = {
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org',
    tradingName: 'Producer Trading'
  },
  tonnage: 100
}

describe(`${packagingRecyclingNotesCreatePath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let packagingRecyclingNotesRepository
    let organisationsRepository
    let ledgerRepository

    beforeAll(async () => {
      packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository()(createMockLogger())
      vi.spyOn(packagingRecyclingNotesRepository, 'create')

      organisationsRepository = {
        findById: vi.fn(async () => ({
          companyDetails: {
            name: 'Test Org',
            tradingName: 'Test Trading'
          }
        })),
        findAccreditationById: vi.fn(async () => ({
          id: accreditationId,
          status: 'approved',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea',
          site: {
            address: { line1: '1 Test St', postcode: 'SW1A 1AA' }
          }
        }))
      }

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          organisationsRepository: () => organisationsRepository,
          ledgerRepository: () => ledgerRepository
        }
      })

      await server.initialize()
    })

    beforeEach(() => {
      ledgerRepository = seedStream()
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful requests', () => {
      it('returns 201 with created PRN details', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const body = JSON.parse(response.payload)
        expect(body.id).toBeDefined()
        expect(body.tonnage).toBe(validPayload.tonnage)
        expect(body.material).toBe(MATERIAL.PLASTIC)
        expect(body.issuedToOrganisation).toStrictEqual(
          validPayload.issuedToOrganisation
        )
        expect(body.status).toBe(PRN_STATUS.DRAFT)
        expect(body.createdAt).toBeDefined()
        expect(body.processToBeUsed).toBe('R3') // plastic uses R3
        expect(body.notes).toBeNull()
        expect(body.isDecemberWaste).toBe(false)
        expect(body.accreditationYear).toBe(2026)
        expect(body.obligationYear).toBe(2026)
        expect(body.wasteProcessingType).toBe(WASTE_PROCESSING_TYPE.REPROCESSOR)
      })

      it('creates PRN with correct organisation and registration', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            organisation: expect.objectContaining({ id: organisationId }),
            registrationId,
            accreditation: expect.objectContaining({ id: accreditationId }),
            obligationYear: 2026,
            issuedToOrganisation: validPayload.issuedToOrganisation
          })
        )
      })

      it('sets obligationYear from the accreditation year', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'approved',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2027-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea',
          site: {
            address: { line1: '1 Test St', postcode: 'SW1A 1AA' }
          }
        })

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ obligationYear: 2027 })
        )
      })

      it('creates PRN with draft status and history but no created operation', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        const createArg =
          packagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg.status.currentStatus).toBe(PRN_STATUS.DRAFT)
        expect(createArg.status).not.toHaveProperty('created')
        expect(createArg.status.history).toStrictEqual([
          expect.objectContaining({
            status: PRN_STATUS.DRAFT,
            at: expect.any(Date),
            by: expect.objectContaining({ id: expect.any(String) })
          })
        ])
      })

      it('sets createdBy and updatedBy to the authenticated user', async () => {
        const userId = 'specific-test-user-id'
        const userName = 'Test User'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator({
            id: userId,
            name: userName,
            email: 'test@example.com'
          }),
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            createdBy: { id: userId, name: userName },
            updatedBy: { id: userId, name: userName },
            status: expect.objectContaining({
              history: expect.arrayContaining([
                expect.objectContaining({
                  by: { id: userId, name: userName }
                })
              ])
            })
          })
        )
      })

      it('falls back to unknown when credentials have no id', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: [SCOPES.organisationWrite]
            }
          },
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            createdBy: expect.objectContaining({ id: 'unknown' })
          })
        )
      })

      it('sets isExport to false for reprocessor', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            isExport: false
          })
        )
      })

      it('sets isExport to true for exporter', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'approved',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          submittedToRegulator: 'ea'
        })

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            isExport: true
          })
        )
      })

      it('snapshots glass recycling process for glass accreditations', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'approved',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.GLASS,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea',
          glassRecyclingProcess: ['remelt'],
          site: {
            address: { line1: '123 Glass Lane', postcode: 'GL1 2AB' }
          }
        })

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            accreditation: expect.objectContaining({
              material: MATERIAL.GLASS,
              glassRecyclingProcess: 'remelt',
              siteAddress: { line1: '123 Glass Lane', postcode: 'GL1 2AB' }
            })
          })
        )
      })

      it('omits glass recycling process for non-glass accreditations', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        const createArg =
          packagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg.accreditation).not.toHaveProperty(
          'glassRecyclingProcess'
        )
      })

      it('returns 500 when accreditation has no validFrom', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'approved',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea'
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })

      it('accepts registrationType on issuedToOrganisation', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            issuedToOrganisation: {
              ...validPayload.issuedToOrganisation,
              registrationType: 'LARGE_PRODUCER'
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const createArg =
          packagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg.issuedToOrganisation.registrationType).toBe(
          'LARGE_PRODUCER'
        )
      })

      it('succeeds when issuedToOrganisation has null tradingName', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            issuedToOrganisation: {
              id: 'producer-org-789',
              name: 'Producer Org',
              tradingName: null
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)

        const createArg =
          packagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg.issuedToOrganisation).not.toHaveProperty('tradingName')
      })

      it('omits notes key from stored data when no notes provided', async () => {
        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        const createArg =
          packagingRecyclingNotesRepository.create.mock.calls[0][0]
        expect(createArg).not.toHaveProperty('notes')
      })

      it('should include issuer notes when provided', async () => {
        const notes = 'Test issuer notes'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            notes
          }
        })

        const body = JSON.parse(response.payload)
        expect(body.notes).toBe(notes)
      })
    })

    describe('validation errors', () => {
      it('returns 422 when tonnage is missing', async () => {
        const { tonnage: _tonnage, ...payloadWithoutTonnage } = validPayload

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: payloadWithoutTonnage
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when tonnage is zero', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            tonnage: 0
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when tonnage is negative', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            tonnage: -1
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when tonnage is not an integer', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            tonnage: 10.5
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when notes exceeds 200 characters', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: {
            ...validPayload,
            notes: 'a'.repeat(201)
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })

    describe('accreditation status', () => {
      it('returns 403 and does not create a PRN when the accreditation is cancelled', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'cancelled',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea'
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(response.payload).toContain(
          'Cannot create a PRN on a cancelled accreditation'
        )
        expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
      })

      it('creates a PRN when the accreditation is suspended', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'suspended',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea',
          site: {
            address: { line1: '1 Test St', postcode: 'SW1A 1AA' }
          }
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)
      })
    })

    describe('waste balance validation', () => {
      const url = `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`

      it('returns 409 and creates no draft when tonnage exceeds the available balance', async () => {
        ledgerRepository = seedStream({ amount: 50, availableAmount: 50 })

        const response = await server.inject({
          method: 'POST',
          url,
          ...asOperator(),
          payload: { ...validPayload, tonnage: 51 }
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(response.payload).toContain(
          'Insufficient available waste balance'
        )
        expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
      })

      it('creates the draft when tonnage equals the available balance', async () => {
        ledgerRepository = seedStream({ amount: 100, availableAmount: 100 })

        const response = await server.inject({
          method: 'POST',
          url,
          ...asOperator(),
          payload: { ...validPayload, tonnage: 100 }
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)
        expect(packagingRecyclingNotesRepository.create).toHaveBeenCalled()
      })

      it('returns 409 for an exporter (PERN) journey when tonnage exceeds the balance', async () => {
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          id: accreditationId,
          status: 'approved',
          accreditationNumber: 'ACC-001',
          material: MATERIAL.PLASTIC,
          validFrom: '2026-01-01',
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          submittedToRegulator: 'ea'
        })
        ledgerRepository = seedStream({ amount: 50, availableAmount: 50 })

        const response = await server.inject({
          method: 'POST',
          url,
          ...asOperator(),
          payload: { ...validPayload, tonnage: 51 }
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(response.payload).toContain(
          'Insufficient available waste balance'
        )
        expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
      })

      it('returns 409 when the accreditation has no credited balance yet', async () => {
        // A newly-approved accreditation that has submitted no summary logs has
        // no ledger, so its available balance is zero and any tonnage exceeds it.
        ledgerRepository = seedStream(null)

        const response = await server.inject({
          method: 'POST',
          url,
          ...asOperator(),
          payload: { ...validPayload, tonnage: 1 }
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(packagingRecyclingNotesRepository.create).not.toHaveBeenCalled()
      })

      it('reads the current ledger on each submission, rejecting after the balance drops', async () => {
        // Seeded balance is 500 available (beforeEach); 200 is comfortably within it.
        const first = await server.inject({
          method: 'POST',
          url,
          ...asOperator(),
          payload: { ...validPayload, tonnage: 200 }
        })
        expect(first.statusCode).toBe(StatusCodes.CREATED)

        // A competing PRN ringfences 400 on the same ledger, dropping available
        // to 100 — the route must re-read this, not the balance it first saw.
        await ledgerRepository.appendEvents([
          buildPrnCreatedEvent({
            organisationId,
            registrationId,
            accreditationId,
            number: 2,
            payload: { prnId: 'competing-prn', amount: 400 },
            openingBalance: { amount: 500, availableAmount: 500 },
            closingBalance: { amount: 500, availableAmount: 100 }
          })
        ])

        const second = await server.inject({
          method: 'POST',
          url,
          ...asOperator(),
          payload: { ...validPayload, tonnage: 200 }
        })
        expect(second.statusCode).toBe(StatusCodes.CONFLICT)
      })
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        packagingRecyclingNotesRepository.create.mockRejectedValueOnce(
          Boom.default.notFound('Organisation not found')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 500 for unexpected errors', async () => {
        packagingRecyclingNotesRepository.create.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asOperator(),
          payload: validPayload
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
