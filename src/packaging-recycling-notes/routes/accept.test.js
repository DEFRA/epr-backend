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
import { MATERIAL } from '#domain/organisations/model.js'

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const organisationId = 'org-123'
const accreditationId = 'acc-789'

const createMockPrn = (overrides = {}) => ({
  id: prnId,
  schemaVersion: 1,
  prnNumber,
  organisationId,
  accreditationId,
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org'
  },
  tonnage: 100,
  material: MATERIAL.PLASTIC,
  isExport: false,
  isDecemberWaste: false,
  accreditationYear: 2026,
  issuedAt: new Date('2026-01-15T10:00:00Z'),
  issuedBy: { id: 'user-issuer', name: 'Issuer User', position: 'Manager' },
  notes: 'Test notes',
  status: {
    currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
    history: [
      { status: PRN_STATUS.DRAFT, updatedAt: new Date('2026-01-10T10:00:00Z') },
      {
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        updatedAt: new Date('2026-01-12T10:00:00Z')
      },
      {
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        updatedAt: new Date('2026-01-15T10:00:00Z')
      }
    ]
  },
  createdAt: new Date('2026-01-10T10:00:00Z'),
  createdBy: { id: 'user-123', name: 'Test User' },
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  updatedBy: { id: 'user-issuer', name: 'Issuer User' },
  ...overrides
})

const acceptUrl = `/v1/packaging-recycling-notes/${prnNumber}/accept`

describe(`POST /v1/packaging-recycling-notes/{prnNumber}/accept`, () => {
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
          lumpyPackagingRecyclingNotes: true
        })
      })
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful acceptance', () => {
      it('returns 204 when PRN is awaiting acceptance', async () => {
        const mockPrn = createMockPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: {
              currentStatus: PRN_STATUS.ACCEPTED,
              history: [
                ...mockPrn.status.history,
                {
                  status: PRN_STATUS.ACCEPTED,
                  updatedAt: new Date()
                }
              ]
            }
          }
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl
        })

        expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
        expect(response.payload).toBe('')
      })

      it('calls updateStatus with accepted status and PRN id', async () => {
        const mockPrn = createMockPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
          }
        )

        await server.inject({
          method: 'POST',
          url: acceptUrl
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: prnId,
            status: PRN_STATUS.ACCEPTED
          })
        )
      })

      it('uses provided acceptedAt timestamp', async () => {
        const acceptedAt = '2026-02-01T10:30:00Z'
        const mockPrn = createMockPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
          }
        )

        await server.inject({
          method: 'POST',
          url: acceptUrl,
          payload: { acceptedAt }
        })

        expect(
          lumpyPackagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            updatedAt: new Date(acceptedAt)
          })
        )
      })

      it('uses current time when acceptedAt not provided', async () => {
        const beforeCall = new Date()
        const mockPrn = createMockPrn()
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          mockPrn
        )
        lumpyPackagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          {
            ...mockPrn,
            status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
          }
        )

        await server.inject({
          method: 'POST',
          url: acceptUrl
        })

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
          url: acceptUrl
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 409 when PRN is already accepted', async () => {
        const acceptedPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            history: [{ status: PRN_STATUS.ACCEPTED, updatedAt: new Date() }]
          }
        })
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          acceptedPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('returns 409 when PRN is rejected', async () => {
        const rejectedPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.REJECTED,
            history: [{ status: PRN_STATUS.REJECTED, updatedAt: new Date() }]
          }
        })
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          rejectedPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('returns 409 when PRN is cancelled', async () => {
        const cancelledPrn = createMockPrn({
          status: {
            currentStatus: PRN_STATUS.CANCELLED,
            history: [{ status: PRN_STATUS.CANCELLED, updatedAt: new Date() }]
          }
        })
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockResolvedValueOnce(
          cancelledPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('returns 500 when repository throws unexpected error', async () => {
        lumpyPackagingRecyclingNotesRepository.findByPrnNumber.mockRejectedValueOnce(
          new Error('Database connection lost')
        )

        const response = await server.inject({
          method: 'POST',
          url: acceptUrl
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })
})
