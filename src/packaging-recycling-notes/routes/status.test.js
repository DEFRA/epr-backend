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
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  MATERIAL,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { packagingRecyclingNotesUpdateStatusPath } from './status.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'
const accreditationId = 'acc-789'
const prnId = '507f1f77bcf86cd799439011'

/**
 * A valid appended stream event, as the ledger-path balance effects return one.
 * The read-side fold reads `kind`, `number`, `createdAt` and `createdBy` off it.
 *
 * @param {import('#waste-balances/repository/stream-schema.js').StreamEventKind} kind
 * @param {number} [number]
 */
const buildAppendedEvent = (kind, number = 2) => ({
  id: `event-${number}`,
  registrationId,
  accreditationId,
  organisationId,
  number,
  kind,
  payload: { prnId, amount: 100 },
  openingBalance: { amount: 500, availableAmount: 500 },
  closingBalance: { amount: 500, availableAmount: 400 },
  createdAt: new Date('2026-02-03T10:00:00.000Z'),
  createdBy: { id: 'test-user-id', name: 'Ada Lovelace' }
})

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

  describe('when feature flag is enabled', () => {
    let server
    let packagingRecyclingNotesRepository
    let wasteBalancesRepository
    let organisationsRepository
    const mockPrn = createMockPrn()

    const createMockWasteBalance = (overrides = {}) => ({
      id: 'balance-123',
      organisationId,
      accreditationId,
      amount: 500,
      availableAmount: 500,
      version: 1,
      schemaVersion: 1,
      ...overrides
    })

    beforeAll(async () => {
      wasteBalancesRepository = {
        findBalance: vi.fn().mockResolvedValue(createMockWasteBalance()),
        getPrnCatchupEvents: vi.fn().mockResolvedValue([]),
        appendStreamEvent: vi.fn(),
        deductAvailableBalanceForPrnCreation: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED)),
        deductTotalBalanceForPrnIssue: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
      }

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
          wasteBalancesRepository: () => wasteBalancesRepository,
          organisationsRepository: () => organisationsRepository
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      await server.initialize()
    })

    beforeEach(() => {
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)

        // Should have only tried twice before the non-collision error
        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledTimes(2)
      })

      it('sets updatedBy to the authenticated user', async () => {
        const userId = 'specific-test-user-id'
        const userName = 'Test User Name'

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          auth: {
            strategy: 'access-token',
            credentials: {
              scope: ['standard_user'],
              id: userId,
              name: userName,
              email: 'test@example.com',
              linkedOrgId: organisationId
            }
          },
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(
          wasteBalancesRepository.deductAvailableBalanceForPrnCreation
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            createdBy: expect.objectContaining({ id: userId, name: userName })
          })
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
              scope: ['standard_user'],
              linkedOrgId: organisationId
            }
          },
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(
          wasteBalancesRepository.deductAvailableBalanceForPrnCreation
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            createdBy: expect.objectContaining({
              id: 'unknown',
              name: 'unknown'
            })
          })
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: differentOrgId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid status value', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
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
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
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
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.ACCEPTED }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('is not permitted to transition')
      })

      it('does not trigger waste balance changes for blocked transitions', async () => {
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
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.ACCEPTED }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(
          wasteBalancesRepository.deductAvailableBalanceForPrnCreation
        ).not.toHaveBeenCalled()
        expect(
          wasteBalancesRepository.deductTotalBalanceForPrnIssue
        ).not.toHaveBeenCalled()
      })
    })
  })

  describe('waste balance deduction on PRN creation', () => {
    let server
    let packagingRecyclingNotesRepository
    let wasteBalancesRepository
    let organisationsRepository
    const mockPrn = createMockPrn({ tonnage: 50.5 })

    const createMockWasteBalance = (overrides = {}) => ({
      id: 'balance-123',
      organisationId,
      accreditationId,
      amount: 500,
      availableAmount: 500,
      version: 1,
      schemaVersion: 1,
      ...overrides
    })

    beforeAll(async () => {
      wasteBalancesRepository = {
        findBalance: vi.fn().mockResolvedValue(createMockWasteBalance()),
        getPrnCatchupEvents: vi.fn().mockResolvedValue([]),
        appendStreamEvent: vi.fn(),
        deductAvailableBalanceForPrnCreation: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED)),
        deductTotalBalanceForPrnIssue: vi
          .fn()
          .mockResolvedValue(buildAppendedEvent(STREAM_EVENT_KIND.PRN_ISSUED))
      }

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
          wasteBalancesRepository: () => wasteBalancesRepository,
          organisationsRepository: () => organisationsRepository
        },
        featureFlags: createInMemoryFeatureFlags()
      })

      await server.initialize()
    })

    beforeEach(() => {
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

    it('deducts tonnage from available balance when transitioning to awaiting_authorisation', async () => {
      const balance = createMockWasteBalance()
      wasteBalancesRepository.findBalance.mockResolvedValueOnce(balance)
      wasteBalancesRepository.deductAvailableBalanceForPrnCreation.mockResolvedValueOnce(
        buildAppendedEvent(STREAM_EVENT_KIND.PRN_CREATED)
      )
      packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(mockPrn)

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        auth: {
          strategy: 'access-token',
          credentials: {
            scope: ['standard_user'],
            id: 'test-user-id',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            linkedOrgId: organisationId
          }
        },
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).toHaveBeenCalledWith({
        accreditationId,
        registrationId,
        organisationId,
        prnId,
        tonnage: 50.5,
        createdBy: {
          id: 'test-user-id',
          name: 'Ada Lovelace',
          email: 'ada@example.com'
        }
      })
    })

    it('does not deduct balance for non-creation transitions', async () => {
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

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_ACCEPTANCE }
      })

      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).not.toHaveBeenCalled()
    })

    it('returns 400 when no waste balance exists', async () => {
      wasteBalancesRepository.findBalance.mockResolvedValueOnce(null)
      packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
        createMockPrn()
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).not.toHaveBeenCalled()
    })

    it('returns 500 when waste balance deduction fails', async () => {
      const balance = createMockWasteBalance()
      wasteBalancesRepository.findBalance.mockResolvedValueOnce(balance)
      wasteBalancesRepository.deductAvailableBalanceForPrnCreation.mockRejectedValueOnce(
        new Error('Database write failed')
      )
      packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
        createMockPrn()
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})
