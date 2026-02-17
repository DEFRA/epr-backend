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
import {
  createMockIssuedPrn,
  generateExternalApiToken
} from './test-helpers.js'

const externalApiClientId = randomUUID()

const authHeaders = {
  authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
}

const listUrl = '/v1/packaging-recycling-notes'

const visibilityFilter = {
  excludeOrganisationIds: ['excluded-org-id']
}

describe('GET /v1/packaging-recycling-notes', () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let packagingRecyclingNotesRepository

    beforeAll(async () => {
      packagingRecyclingNotesRepository = {
        findById: vi.fn(),
        findByPrnNumber: vi.fn(),
        findByAccreditation: vi.fn(),
        create: vi.fn(),
        updateStatus: vi.fn(),
        findByStatus: vi.fn()
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
          wasteBalancesRepository: () => ({}),
          organisationsRepository: () => ({})
        },
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotesExternalApi: true
        })
      })

      server.app.prnVisibilityFilter = visibilityFilter
    })

    afterEach(() => {
      vi.resetAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

    describe('successful listing', () => {
      it('returns 200 with mapped items', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [mockPrn],
          nextCursor: null,
          hasMore: false
        })

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.items).toHaveLength(1)
        expect(payload.items[0].id).toBe(mockPrn.id)
        expect(payload.items[0].tonnageValue).toBe(mockPrn.tonnage)
        expect(payload.items[0].status.currentStatus).toBe(
          PRN_STATUS.AWAITING_ACCEPTANCE
        )
        expect(payload.hasMore).toBe(false)
        expect(payload.nextCursor).toBeUndefined()
      })

      it('passes statuses to repository as array', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance,cancelled`,
          headers: authHeaders
        })

        expect(
          packagingRecyclingNotesRepository.findByStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            statuses: ['awaiting_acceptance', 'cancelled']
          })
        )
      })

      it('passes date range filters to repository', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        const dateFrom = '2026-01-01T00:00:00Z'
        const dateTo = '2026-01-31T23:59:59Z'

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&dateFrom=${dateFrom}&dateTo=${dateTo}`,
          headers: authHeaders
        })

        expect(
          packagingRecyclingNotesRepository.findByStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            dateFrom: new Date(dateFrom),
            dateTo: new Date(dateTo)
          })
        )
      })

      it('passes cursor to repository', async () => {
        const cursor = '507f1f77bcf86cd799439012'
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&cursor=${cursor}`,
          headers: authHeaders
        })

        expect(
          packagingRecyclingNotesRepository.findByStatus
        ).toHaveBeenCalledWith(expect.objectContaining({ cursor }))
      })

      it('passes limit to repository', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&limit=50`,
          headers: authHeaders
        })

        expect(
          packagingRecyclingNotesRepository.findByStatus
        ).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }))
      })

      it('returns nextCursor when hasMore is true', async () => {
        const nextCursor = '507f1f77bcf86cd799439099'
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [createMockIssuedPrn()],
          nextCursor,
          hasMore: true
        })

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        const payload = JSON.parse(response.payload)
        expect(payload.hasMore).toBe(true)
        expect(payload.nextCursor).toBe(nextCursor)
      })

      it('returns empty items array when no PRNs match', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=cancelled`,
          headers: authHeaders
        })

        const payload = JSON.parse(response.payload)
        expect(payload.items).toEqual([])
        expect(payload.hasMore).toBe(false)
      })

      it('maps each item using external PRN mapper', async () => {
        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [mockPrn],
          nextCursor: null,
          hasMore: false
        })

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        const payload = JSON.parse(response.payload)
        const item = payload.items[0]

        expect(item.issuedByOrganisation.id).toBe(mockPrn.organisation.id)
        expect(item.issuedByOrganisation.name).toBe(mockPrn.organisation.name)
        expect(item.issuedToOrganisation.id).toBe(
          mockPrn.issuedToOrganisation.id
        )
        expect(item.accreditation.id).toBe(mockPrn.accreditation.id)
        expect(item.isDecemberWaste).toBe(mockPrn.isDecemberWaste)
        expect(item.isExport).toBe(mockPrn.isExport)
        expect(item.prnNumber).toBe(mockPrn.prnNumber)
        expect(item.issuerNotes).toBe(mockPrn.notes)
      })

      it('uses default limit of 200 when not provided', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        expect(
          packagingRecyclingNotesRepository.findByStatus
        ).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }))
      })

      it('does not pass dates to repository when not provided', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        const callArgs =
          packagingRecyclingNotesRepository.findByStatus.mock.calls[0][0]
        expect(callArgs.dateFrom).toBeUndefined()
        expect(callArgs.dateTo).toBeUndefined()
      })
    })

    describe('test organisation filtering', () => {
      it('excludes PRNs belonging to test organisations from results', async () => {
        const testOrgPrn = createMockIssuedPrn({
          id: 'test-org-prn-id',
          organisation: { id: 'excluded-org-id', name: 'Test Org' }
        })
        const realOrgPrn = createMockIssuedPrn({
          id: 'real-org-prn-id',
          organisation: { id: 'real-org-id', name: 'Real Org' }
        })
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [testOrgPrn, realOrgPrn],
          nextCursor: null,
          hasMore: false
        })

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        const payload = JSON.parse(response.payload)
        expect(payload.items).toHaveLength(1)
        expect(payload.items[0].id).toBe('real-org-prn-id')
      })

      it('returns all PRNs when no visibility filter is configured', async () => {
        const saved = server.app.prnVisibilityFilter
        server.app.prnVisibilityFilter = undefined

        const mockPrn = createMockIssuedPrn()
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [mockPrn],
          nextCursor: null,
          hasMore: false
        })

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        const payload = JSON.parse(response.payload)
        expect(payload.items).toHaveLength(1)

        server.app.prnVisibilityFilter = saved
      })

      it('does not pass exclusion params to repository', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        const callArgs =
          packagingRecyclingNotesRepository.findByStatus.mock.calls[0][0]
        expect(callArgs.excludeOrganisationIds).toBeUndefined()
        expect(callArgs.excludePrnIds).toBeUndefined()
      })
    })

    describe('validation', () => {
      it('returns 422 when statuses is missing', async () => {
        const response = await server.inject({
          method: 'GET',
          url: listUrl,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when statuses contains an invalid value', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=invalid_status`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when dateFrom is not a valid ISO date', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&dateFrom=not-a-date`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when dateTo is not a valid ISO date', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&dateTo=not-a-date`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when limit is not a positive integer', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&limit=-1`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when limit is zero', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&limit=0`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('caps limit at the maximum when exceeded', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
          items: [],
          nextCursor: null,
          hasMore: false
        })

        await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance&limit=10000`,
          headers: authHeaders
        })

        const callArgs =
          packagingRecyclingNotesRepository.findByStatus.mock.calls[0][0]
        expect(callArgs.limit).toBe(500)
      })
    })

    describe('error handling', () => {
      it('returns 500 when repository throws unexpected error', async () => {
        packagingRecyclingNotesRepository.findByStatus.mockRejectedValueOnce(
          new Error('Database connection lost')
        )

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })

      it('passes through Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        packagingRecyclingNotesRepository.findByStatus.mockRejectedValueOnce(
          Boom.default.forbidden('Access denied')
        )

        const response = await server.inject({
          method: 'GET',
          url: `${listUrl}?statuses=awaiting_acceptance`,
          headers: authHeaders
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })
  })
})
