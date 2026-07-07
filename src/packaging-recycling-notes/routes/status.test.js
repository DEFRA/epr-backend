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

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  MATERIAL,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { packagingRecyclingNotesUpdateStatusPath } from './status.js'
import { SCOPES } from '#common/helpers/auth/constants.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'
const accreditationId = 'acc-789'
const prnId = '507f1f77bcf86cd799439011'

const SEED_BALANCE = { amount: 500, availableAmount: 500 }

/**
 * An in-memory stream seeded with one summary-log submission, opening the
 * ledgerId's ledger at the given balance so PRN commands resolve against it.
 * Passing `null` leaves the ledger absent, which the commands reject as
 * `NO_LEDGER`.
 *
 * @param {{ amount: number, availableAmount: number } | null} [closingBalance]
 */
const seedStream = (closingBalance = SEED_BALANCE) =>
  createInMemoryLedgerRepository(
    closingBalance
      ? [
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
        ]
      : []
  )()

const createMockPrn = (overrides = {}) => ({
  id: prnId,
  version: 1,
  schemaVersion: 2,
  organisation: { id: organisationId, name: 'Test Organisation' },
  registrationId,
  accreditation: {
    id: accreditationId,
    accreditationNumber: 'ACC-2026-001',
    accreditationYear: 2026,
    material: MATERIAL.PLASTIC,
    submittedToRegulator: REGULATOR.EA
  },
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org'
  },
  tonnage: 100,
  isExport: false,
  isDecemberWaste: false,
  notes: 'Test notes',
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    currentStatusAt: new Date(),
    history: [
      {
        status: PRN_STATUS.DRAFT,
        at: new Date(),
        by: { id: 'user-123', name: 'Test User' }
      }
    ]
  },
  createdAt: new Date(),
  createdBy: { id: 'user-123', name: 'Test User' },
  updatedAt: new Date(),
  updatedBy: null,
  ...overrides
})

describe(`${packagingRecyclingNotesUpdateStatusPath} route`, () => {
  setupAuthContext()

  describe('writing a status transition', () => {
    let server
    let packagingRecyclingNotesRepository
    let ledgerRepository
    let organisationsRepository
    const mockPrn = createMockPrn()

    beforeAll(async () => {
      organisationsRepository = {
        findAccreditationById: vi.fn(async () => ({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: REGULATOR.EA
        }))
      }

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          ledgerRepository: () => ledgerRepository,
          organisationsRepository: () => organisationsRepository
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      await server.initialize()
    })

    beforeEach(() => {
      ledgerRepository = seedStream()
      packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([mockPrn])({
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
          trace: vi.fn(),
          fatal: vi.fn(),
          child: vi.fn()
        })
      vi.spyOn(packagingRecyclingNotesRepository, 'findById')
      vi.spyOn(packagingRecyclingNotesRepository, 'updateStatus')
      vi.spyOn(packagingRecyclingNotesRepository, 'persistProjection')
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful requests', () => {
      it('returns 200 and calls updateStatus with correct parameters', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.id).toBe(prnId)
        expect(body.status).toBe(PRN_STATUS.AWAITING_AUTHORISATION)

        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            projection: expect.objectContaining({
              id: prnId,
              status: expect.objectContaining({
                currentStatus: PRN_STATUS.AWAITING_AUTHORISATION
              })
            })
          })
        )
      })

      it('does not generate PRN number for non-issuing transitions', async () => {
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        const { projection } =
          packagingRecyclingNotesRepository.persistProjection.mock.calls[0][0]
        expect(projection).not.toHaveProperty('prnNumber')
      })
    })

    describe('PRN number generation', () => {
      it('generates PRN number when issuing (transitioning to awaiting_acceptance)', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            projection: expect.objectContaining({
              prnNumber: expect.stringMatching(/^ER26\d{5}$/)
            })
          })
        )
      })

      it('generates PRN number with X for exporter', async () => {
        const exporterPrn = createMockPrn({
          isExport: true,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          exporterPrn
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            projection: expect.objectContaining({
              prnNumber: expect.stringMatching(/^EX26\d{5}$/)
            })
          })
        )
      })

      it('uses regulator code for agency prefix', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: REGULATOR.NRW
        })

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            projection: expect.objectContaining({
              prnNumber: expect.stringMatching(/^WR26\d{5}$/)
            })
          })
        )
      })

      it('returns PRN number in response when issuing', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        const body = JSON.parse(response.payload)
        expect(body.prnNumber).toMatch(/^ER26\d{5}$/)
      })

      it('retries with suffix when PRN number collision occurs', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // First persist throws a number collision, second succeeds
        packagingRecyclingNotesRepository.persistProjection
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345'))
          .mockImplementationOnce(async ({ projection }) => projection)

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        // Should have been called twice - once without suffix, once with A
        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledTimes(2)

        // Second call should carry the A suffix
        const secondCall =
          packagingRecyclingNotesRepository.persistProjection.mock.calls[1][0]
        expect(secondCall.projection.prnNumber).toMatch(/^ER26\d{5}A$/)
      })

      it('continues through suffixes until one succeeds', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // First three persists throw collisions, fourth succeeds
        packagingRecyclingNotesRepository.persistProjection
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345'))
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345A'))
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345B'))
          .mockImplementationOnce(async ({ projection }) => projection)

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledTimes(4)

        // Fourth call should carry the C suffix
        const fourthCall =
          packagingRecyclingNotesRepository.persistProjection.mock.calls[3][0]
        expect(fourthCall.projection.prnNumber).toMatch(/^ER26\d{5}C$/)
      })

      it('returns 500 when all suffix attempts are exhausted', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // All 27 attempts (no suffix + A-Z) throw conflict
        packagingRecyclingNotesRepository.persistProjection.mockRejectedValue(
          new PrnNumberConflictError('ER2612345')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

        // Should have tried 27 times (no suffix + A through Z)
        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledTimes(27)
      })

      it('returns 500 when non-collision error occurs during retry', async () => {
        const awaitingAuthPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )

        // First persist throws a collision, second throws a database error
        packagingRecyclingNotesRepository.persistProjection
          .mockRejectedValueOnce(new PrnNumberConflictError('ER2612345'))
          .mockRejectedValueOnce(new Error('Database connection lost'))

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

        // Should have only tried twice before the non-collision error
        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledTimes(2)
      })

      it('attributes the appended event to the authenticated user', async () => {
        const userId = 'specific-test-user-id'
        const userName = 'Test User Name'

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator({
            id: userId,
            name: userName,
            email: 'test@example.com'
          }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        const events = await ledgerRepository.findAllInLedger(
          registrationId,
          accreditationId
        )
        expect(events.at(-1)?.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
        expect(events.at(-1)?.createdBy).toEqual(
          expect.objectContaining({ id: userId, name: userName })
        )
      })

      it('falls back to unknown when credentials have no id or name', async () => {
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: [SCOPES.organisationWrite]
            }
          },
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        const events = await ledgerRepository.findAllInLedger(
          registrationId,
          accreditationId
        )
        expect(events.at(-1)?.createdBy).toEqual(
          expect.objectContaining({ id: 'unknown', name: 'unknown' })
        )
      })
    })

    describe('error handling', () => {
      it('returns 404 when PRN not found', async () => {
        const nonExistentId = '507f1f77bcf86cd799439099'

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(null)

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${nonExistentId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 409 when a concurrent writer has already bumped the version', async () => {
        const stale = await packagingRecyclingNotesRepository.findById(prnId)

        await packagingRecyclingNotesRepository.updateStatus({
          id: prnId,
          version: stale.version,
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedBy: { id: 'other-writer', name: 'Other Writer' },
          updatedAt: new Date(),
          operation: {
            slot: 'created',
            at: new Date(),
            by: { id: 'other-writer', name: 'Other Writer' }
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(stale)

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        expect(response.payload).toContain('Version conflict')
      })

      it('returns 404 when PRN belongs to different organisation', async () => {
        const differentOrgId = 'different-org'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${differentOrgId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 400 for invalid status transition', async () => {
        // Create a PRN that's already in ACCEPTED status
        const createdPrnId = '507f1f77bcf86cd799439022'
        const createdPrn = createMockPrn({
          id: createdPrnId,
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            history: [
              {
                status: PRN_STATUS.ACCEPTED,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createdPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${createdPrnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.DRAFT }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('No transition exists from')
      })

      it('returns 400 when PRN has unknown current status', async () => {
        const unknownStatusPrnId = '507f1f77bcf86cd799439033'
        const unknownStatusPrn = createMockPrn({
          id: unknownStatusPrnId,
          status: {
            currentStatus: 'unknown_status',
            history: [
              {
                status: 'unknown_status',
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          unknownStatusPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${unknownStatusPrnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('No transition exists from')
      })

      it('returns 422 for invalid PRN id format', async () => {
        const invalidId = 'invalid-id'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${invalidId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid status value', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: 'invalid_status' }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 403 when issuing a PRN on a suspended accreditation', async () => {
        const awaitingAuthPrnId = '507f1f77bcf86cd799439044'
        const awaitingAuthPrn = createMockPrn({
          id: awaitingAuthPrnId,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: new Date(),
                by: { id: 'user-123', name: 'Test User' }
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAuthPrn
        )
        organisationsRepository.findAccreditationById.mockResolvedValueOnce({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: REGULATOR.EA,
          status: 'suspended'
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${awaitingAuthPrnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(response.payload).toContain(
          'Cannot issue a PRN on a suspended accreditation'
        )
      })

      it('returns 500 when the projection persist returns null', async () => {
        // Reset PRN to draft status for this test
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )
        packagingRecyclingNotesRepository.persistProjection.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })

      it('returns 500 when repository throws non-Boom error', async () => {
        // Reset PRN to draft status for this test
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )
        packagingRecyclingNotesRepository.persistProjection.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })

      it('returns 400 when the accreditation has no waste balance ledger', async () => {
        ledgerRepository = seedStream(null)
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('No waste balance found')
      })
    })

    describe('actor enforcement', () => {
      it('blocks producer transitions via internal route', async () => {
        const awaitingAcceptancePrn = createMockPrn({
          prnNumber: 'ER2600001',
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            history: [
              {
                status: PRN_STATUS.AWAITING_ACCEPTANCE,
                updatedAt: new Date()
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAcceptancePrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.ACCEPTED }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('is not permitted to transition')
      })

      it('appends no balance event for blocked transitions', async () => {
        const awaitingAcceptancePrn = createMockPrn({
          prnNumber: 'ER2600001',
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            history: [
              {
                status: PRN_STATUS.AWAITING_ACCEPTANCE,
                updatedAt: new Date()
              }
            ]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          awaitingAcceptancePrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asOperator(),
          payload: { status: PRN_STATUS.ACCEPTED }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        const events = await ledgerRepository.findAllInLedger(
          registrationId,
          accreditationId
        )
        expect(events).toHaveLength(1)
        expect(events[0]?.kind).toBe(LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED)
      })
    })
  })
})
