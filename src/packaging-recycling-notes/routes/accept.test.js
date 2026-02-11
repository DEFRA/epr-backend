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
import { config } from '#root/config.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
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

const acceptUrl = `/v1/packaging-recycling-notes/${prnNumber}/accept`
const authHeaders = {
  authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
}

describe(`POST /v1/packaging-recycling-notes/{prnNumber}/accept`, () => {
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
        updateStatus: vi.fn()
      }

      wasteBalancesRepository = {
        findByAccreditationId: vi.fn(),
        findByAccreditationIds: vi.fn(),
        deductAvailableBalanceForPrnCreation: vi.fn(),
        deductTotalBalanceForPrnIssue: vi.fn(),
        creditAvailableBalanceForPrnCancellation: vi.fn()
      }

      config.set(
        'packagingRecyclingNotesExternalApi.clientId',
        externalApiClientId
      )

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          wasteBalancesRepository: () => wasteBalancesRepository,
          organisationsRepository: () => ({})
        },
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotesExternalApi: true
        })
      })
    })

    afterEach(() => {
      vi.resetAllMocks()
    })

    afterAll(async () => {
      await server.stop()
      config.reset('packagingRecyclingNotesExternalApi.clientId')
    })

    describe('successful acceptance', () => {
      it('returns 204 when PRN is awaiting acceptance', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        packagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce({
          ...mockPrn,
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            history: [
              ...mockPrn.status.history,
              {
                status: PRN_STATUS.ACCEPTED,
                at: new Date(),
                by: { id: 'rpd', name: 'RPD' }
              }
            ]
          }
        })

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(response.payload).toBe('')
      })

      it('calls updateStatus with accepted status and PRN id', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        packagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce({
          ...mockPrn,
          status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
        })

        await server.inject({
          method: 'POST',
          url: acceptUrl,
          headers: authHeaders
        })

        expect(
          packagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: prnId,
            status: PRN_STATUS.ACCEPTED,
            operation: expect.objectContaining({
              slot: 'accepted',
              by: expect.objectContaining({
                id: externalApiClientId,
                name: 'RPD'
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

      it('uses provided acceptedAt timestamp', async () => {
        const acceptedAt = '2026-02-01T10:30:00Z'
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        packagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce({
          ...mockPrn,
          status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
        })

        await server.inject({
          method: 'POST',
          url: acceptUrl,
          headers: authHeaders,
          payload: { acceptedAt }
        })

        expect(
          packagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            updatedAt: new Date(acceptedAt)
          })
        )
      })

      it('uses current time when acceptedAt not provided', async () => {
        const beforeCall = new Date()
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        packagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce({
          ...mockPrn,
          status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
        })

        await server.inject({
          method: 'POST',
          url: acceptUrl,
          headers: authHeaders
        })

        const callArgs =
          packagingRecyclingNotesRepository.updateStatus.mock.calls[0][0]
        expect(callArgs.updatedAt.getTime()).toBeGreaterThanOrEqual(
          beforeCall.getTime()
        )
      })

      it('does not affect waste balance', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        packagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce({
          ...mockPrn,
          status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
        })

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(
          wasteBalancesRepository.deductAvailableBalanceForPrnCreation
        ).not.toHaveBeenCalled()
        expect(
          wasteBalancesRepository.deductTotalBalanceForPrnIssue
        ).not.toHaveBeenCalled()
        expect(
          wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
        ).not.toHaveBeenCalled()
      })
    })

    describe('error handling', () => {
      it('returns 404 with spec error format when PRN not found', async () => {
        packagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl,
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
          url: acceptUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('CONFLICT')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 409 when PRN is awaiting cancellation', async () => {
        const rejectedPrn = createMockIssuedPrn({
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
          rejectedPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl,
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
          url: acceptUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
        const payload = JSON.parse(response.payload)
        expect(payload.code).toBe('CONFLICT')
        expect(payload.message).toEqual(expect.any(String))
        expect(Object.keys(payload)).toEqual(['code', 'message'])
      })

      it('returns 400 with spec error format for invalid acceptedAt format', async () => {
        const response = await server.inject({
          method: 'POST',
          url: acceptUrl,
          headers: authHeaders,
          payload: { acceptedAt: 'not-a-date' }
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
          url: acceptUrl,
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
