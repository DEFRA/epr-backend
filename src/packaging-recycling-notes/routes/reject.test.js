import { StatusCodes } from 'http-status-codes'
import { randomUUID } from 'node:crypto'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  cognitoJwksUrl,
  setupAuthContext
} from '#vite/helpers/setup-auth-mocking.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import {
  createMockIssuedPrn,
  generateExternalApiToken
} from './test-helpers.js'

const mockCdpAuditing = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockCdpAuditing(...args)
}))

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const externalApiClientId = randomUUID()

const rejectUrl = `/v1/packaging-recycling-notes/${prnNumber}/reject`
const authHeaders = {
  authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
}

/**
 * The PRN_REJECTED stream event the ledger-path reject appends. The read-side
 * fold projects this onto the PRN doc, moving it to awaiting_cancellation.
 */
const buildRejectedEvent = () => ({
  id: 'event-4',
  registrationId: 'reg-456',
  accreditationId: 'acc-789',
  organisationId: 'org-123',
  number: 4,
  kind: STREAM_EVENT_KIND.PRN_REJECTED,
  payload: { prnId, amount: 100 },
  openingBalance: { amount: 100, availableAmount: 100 },
  closingBalance: { amount: 100, availableAmount: 100 },
  createdAt: new Date('2026-02-03T10:00:00.000Z'),
  createdBy: { id: externalApiClientId, name: 'RPD' }
})

describe(`POST /v1/packaging-recycling-notes/{prnNumber}/reject`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let packagingRecyclingNotesRepository
    let wasteBalancesRepository

    beforeAll(async () => {
      packagingRecyclingNotesRepository = {
        findById: vi.fn(),
        findByPrnNumber: vi.fn(),
        create: vi.fn(),
        findByAccreditation: vi.fn(),
        updateStatus: vi.fn(),
        persistProjection: vi.fn()
      }

      wasteBalancesRepository = {
        findBalance: vi.fn().mockResolvedValue(null),
        getPrnCatchupEvents: vi.fn().mockResolvedValue([]),
        appendStreamEvent: vi.fn()
      }

      server = await createTestServer({
        config: {
          packagingRecyclingNotesExternalApi: {
            clientId: externalApiClientId,
            jwksUrl: cognitoJwksUrl
          }
        },
        repositories: {
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          wasteBalancesRepository: () => wasteBalancesRepository,
          organisationsRepository: () => ({})
        },
        featureFlags: createInMemoryFeatureFlags()
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful rejection', () => {
      it('returns 204 when PRN is awaiting acceptance', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        wasteBalancesRepository.appendStreamEvent.mockResolvedValueOnce(
          buildRejectedEvent()
        )
        packagingRecyclingNotesRepository.persistProjection.mockImplementation(
          async ({ projection }) => projection
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(response.payload).toBe('')
      })

      it('appends a PRN_REJECTED stream event and persists the awaiting_cancellation projection attributed to RPD', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        wasteBalancesRepository.appendStreamEvent.mockResolvedValueOnce(
          buildRejectedEvent()
        )
        packagingRecyclingNotesRepository.persistProjection.mockImplementation(
          async ({ projection }) => projection
        )

        await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(wasteBalancesRepository.appendStreamEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            prnId,
            streamKind: STREAM_EVENT_KIND.PRN_REJECTED,
            createdBy: expect.objectContaining({
              id: externalApiClientId,
              name: 'RPD'
            })
          })
        )
        expect(
          packagingRecyclingNotesRepository.persistProjection
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            projection: expect.objectContaining({
              id: prnId,
              status: expect.objectContaining({
                currentStatus: PRN_STATUS.AWAITING_CANCELLATION
              })
            })
          })
        )

        // CDP audit event
        expect(mockCdpAuditing).toHaveBeenCalledTimes(1)
        const auditPayload = mockCdpAuditing.mock.calls[0][0]
        expect(auditPayload.user).toStrictEqual(
          expect.objectContaining({
            id: externalApiClientId,
            name: 'RPD'
          })
        )
      })

      it('rejects when the payload is null', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        wasteBalancesRepository.appendStreamEvent.mockResolvedValueOnce(
          buildRejectedEvent()
        )
        packagingRecyclingNotesRepository.persistProjection.mockImplementation(
          async ({ projection }) => projection
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders,
          payload: null
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
      })
    })

    describe('error handling', () => {
      it('returns 404 with spec error format when PRN not found', async () => {
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
        expect(JSON.parse(response.payload)).toEqual({
          code: 'NOT_FOUND',
          message: `Packaging recycling note not found: ${prnNumber}`
        })
      })

      it('returns 409 with spec error format when PRN is already accepted', async () => {
        const acceptedPrn = createMockIssuedPrn({
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            history: [
              {
                status: PRN_STATUS.ACCEPTED,
                at: new Date(),
                by: { id: 'rpd', name: 'RPD' }
              }
            ]
          }
        })
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          acceptedPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('CONFLICT')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 409 when PRN is already awaiting cancellation', async () => {
        const awaitingCancellationPrn = createMockIssuedPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            history: [
              {
                status: PRN_STATUS.AWAITING_CANCELLATION,
                at: new Date(),
                by: { id: 'rpd', name: 'RPD' }
              }
            ]
          }
        })
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          awaitingCancellationPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('CONFLICT')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 409 when PRN is cancelled', async () => {
        const cancelledPrn = createMockIssuedPrn({
          status: {
            currentStatus: PRN_STATUS.CANCELLED,
            history: [
              {
                status: PRN_STATUS.CANCELLED,
                at: new Date(),
                by: { id: 'rpd', name: 'RPD' }
              }
            ]
          }
        })
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          cancelledPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('CONFLICT')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 409 when PRN is still in draft', async () => {
        const draftPrn = createMockIssuedPrn({
          status: {
            currentStatus: PRN_STATUS.DRAFT,
            history: [
              {
                status: PRN_STATUS.DRAFT,
                at: new Date(),
                by: { id: 'rpd', name: 'RPD' }
              }
            ]
          }
        })
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          draftPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('CONFLICT')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 400 with spec error format for invalid rejectedAt format', async () => {
        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders,
          payload: { rejectedAt: 'not-a-date' }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('BAD_REQUEST')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 500 with spec error format when repository throws unexpected error', async () => {
        packagingRecyclingNotesRepository.findByPrnNumber.mockRejectedValueOnce(
          new Error('Database connection lost')
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
        expect(JSON.parse(response.payload)).toEqual({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred'
        })
      })
    })
  })
})
