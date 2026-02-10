import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createMockIssuedPrn } from './test-helpers.js'

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'

const rejectUrl = `/v1/packaging-recycling-notes/${prnNumber}/reject`

describe(`POST /v1/packaging-recycling-notes/{prnNumber}/reject`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository = {
        findById: vi.fn(),
        findByPrnNumber: vi.fn(),
        create: vi.fn(),
        findByAccreditation: vi.fn(),
        updateStatus: vi.fn()
      }

      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () =>
            lumpyPackagingRecyclingNotesRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotesExternalApi: true
        })
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
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: {
              currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
              history: [
                ...mockPrn.status.history,
                {
                  status: PRN_STATUS.AWAITING_CANCELLATION,
                  at: new Date(),
                  by: { id: 'rpd', name: 'RPD' }
                }
              ]
            }
          }
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(response.payload).toBe('')
      })

      it('calls updateStatus with awaiting_cancellation status, PRN id, and RPD user', async () => {
        const mockPrn = createMockIssuedPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: {
              currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
              history: []
            }
          }
        )

        await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: prnId,
            status: PRN_STATUS.AWAITING_CANCELLATION,
            updatedBy: { id: 'rpd', name: 'RPD' },
            operation: expect.objectContaining({
              slot: 'rejected',
              by: { id: 'rpd', name: 'RPD' }
            })
          })
        )
      })

      it('uses provided rejectedAt timestamp', async () => {
        const rejectedAt = '2026-02-01T10:30:00Z'
        const mockPrn = createMockIssuedPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: {
              currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
              history: []
            }
          }
        )

        await server.inject({
          method: 'POST',
          url: rejectUrl,
          payload: { rejectedAt }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            updatedAt: new Date(rejectedAt)
          })
        )
      })

      it('uses current time when rejectedAt not provided', async () => {
        const beforeCall = new Date()
        const mockPrn = createMockIssuedPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: {
              currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
              history: []
            }
          }
        )

        await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        const callArgs =
          lumpyPackagingRecyclingNotesRepository.updateStatus.mock.calls[0][0]
        expect(callArgs.updatedAt.getTime()).toBeGreaterThanOrEqual(
          beforeCall.getTime()
        )
      })

      it('uses current time when payload is null', async () => {
        const beforeCall = new Date()
        const mockPrn = createMockIssuedPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: {
              currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
              history: []
            }
          }
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          payload: null
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        const callArgs =
          lumpyPackagingRecyclingNotesRepository.updateStatus.mock.calls[0][0]
        expect(callArgs.updatedAt.getTime()).toBeGreaterThanOrEqual(
          beforeCall.getTime()
        )
      })
    })

    describe('error handling', () => {
      it('returns 404 when PRN not found', async () => {
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 409 when PRN is already accepted', async () => {
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
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          acceptedPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
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
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          awaitingCancellationPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
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
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          cancelledPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
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
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          draftPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('returns 422 for invalid rejectedAt format', async () => {
        const response = await server.inject({
          method: 'POST',
          url: rejectUrl,
          payload: { rejectedAt: 'not-a-date' }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 500 when repository throws unexpected error', async () => {
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockRejectedValueOnce(
          new Error('Database connection lost')
        )

        const response = await server.inject({
          method: 'POST',
          url: rejectUrl
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
