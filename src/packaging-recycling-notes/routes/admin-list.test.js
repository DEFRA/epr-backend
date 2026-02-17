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

import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { createMockIssuedPrn } from './test-helpers.js'

const { validToken } = entraIdMockAuthTokens
const adminListUrl = '/v1/admin/packaging-recycling-notes'

const injectWithAuth = (server, options) =>
  server.inject({
    ...options,
    headers: {
      Authorization: `Bearer ${validToken}`,
      ...options.headers
    }
  })

describe('GET /v1/admin/packaging-recycling-notes', () => {
  setupAuthContext()

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
      repositories: {
        packagingRecyclingNotesRepository: () =>
          packagingRecyclingNotesRepository,
        wasteBalancesRepository: () => ({}),
        organisationsRepository: () => ({})
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
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

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)
      expect(payload.items).toHaveLength(1)
      expect(payload.items[0].id).toBe(mockPrn.id)
      expect(payload.items[0].status).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(payload.items[0].tonnage).toBe(mockPrn.tonnage)
      expect(payload.items[0].material).toBe(mockPrn.accreditation.material)
      expect(payload.items[0].organisationName).toBe(mockPrn.organisation.name)
      expect(payload.items[0].prnNumber).toBe(mockPrn.prnNumber)
      expect(payload.items[0].isDecemberWaste).toBe(mockPrn.isDecemberWaste)
      expect(payload.items[0].notes).toBe(mockPrn.notes)
      expect(payload.items[0].accreditationYear).toBe(
        mockPrn.accreditation.accreditationYear
      )
      expect(payload.items[0].wasteProcessingType).toBe(
        WASTE_PROCESSING_TYPE.REPROCESSOR
      )
      expect(payload.items[0].processToBeUsed).toBe('R3')
      expect(payload.hasMore).toBe(false)
      expect(payload.nextCursor).toBeUndefined()
    })

    it('returns null for optional fields when not present', async () => {
      const mockPrn = createMockIssuedPrn({
        prnNumber: undefined,
        notes: undefined,
        status: {
          currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          currentStatusAt: new Date(),
          history: []
        }
      })
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [mockPrn],
        nextCursor: null,
        hasMore: false
      })

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_authorisation`
      })

      const payload = JSON.parse(response.payload)
      expect(payload.items[0].prnNumber).toBeNull()
      expect(payload.items[0].notes).toBeNull()
      expect(payload.items[0].issuedAt).toBeNull()
      expect(payload.items[0].issuedBy).toBeNull()
    })

    it('returns exporter waste processing type for export PRNs', async () => {
      const mockPrn = createMockIssuedPrn({ isExport: true })
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [mockPrn],
        nextCursor: null,
        hasMore: false
      })

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      const payload = JSON.parse(response.payload)
      expect(payload.items[0].wasteProcessingType).toBe(
        WASTE_PROCESSING_TYPE.EXPORTER
      )
    })

    it('passes statuses to repository as array', async () => {
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false
      })

      await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance,cancelled`
      })

      expect(
        packagingRecyclingNotesRepository.findByStatus
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          statuses: ['awaiting_acceptance', 'cancelled']
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

      await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance&cursor=${cursor}`
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

      await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance&limit=50`
      })

      expect(
        packagingRecyclingNotesRepository.findByStatus
      ).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }))
    })

    it('uses default limit of 500 when not provided', async () => {
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false
      })

      await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      expect(
        packagingRecyclingNotesRepository.findByStatus
      ).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }))
    })

    it('returns nextCursor when hasMore is true', async () => {
      const nextCursor = '507f1f77bcf86cd799439099'
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [createMockIssuedPrn()],
        nextCursor,
        hasMore: true
      })

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
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

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=cancelled`
      })

      const payload = JSON.parse(response.payload)
      expect(payload.items).toEqual([])
      expect(payload.hasMore).toBe(false)
    })

    it('returns issued date and issuer details', async () => {
      const mockPrn = createMockIssuedPrn()
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [mockPrn],
        nextCursor: null,
        hasMore: false
      })

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      const payload = JSON.parse(response.payload)
      expect(payload.items[0].issuedAt).toBe(
        mockPrn.status.issued.at.toISOString()
      )
      expect(payload.items[0].issuedBy).toEqual(mockPrn.status.issued.by)
    })

    it('returns issuedToOrganisation details', async () => {
      const mockPrn = createMockIssuedPrn()
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [mockPrn],
        nextCursor: null,
        hasMore: false
      })

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      const payload = JSON.parse(response.payload)
      expect(payload.items[0].issuedToOrganisation).toEqual(
        mockPrn.issuedToOrganisation
      )
    })
  })

  describe('authentication', () => {
    it('returns 401 when no auth token is provided', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('validation', () => {
    it('returns 422 when statuses is missing', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: adminListUrl
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when statuses contains an invalid value', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=invalid_status`
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when limit is less than 1', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance&limit=0`
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when limit exceeds 1000', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance&limit=1001`
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('accepts all valid statuses', async () => {
      packagingRecyclingNotesRepository.findByStatus.mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false
      })

      const allStatuses = Object.values(PRN_STATUS).join(',')
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=${allStatuses}`
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('error handling', () => {
    it('returns 500 when repository throws unexpected error', async () => {
      packagingRecyclingNotesRepository.findByStatus.mockRejectedValueOnce(
        new Error('Database connection lost')
      )

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('passes through Boom errors from repository', async () => {
      const Boom = await import('@hapi/boom')
      packagingRecyclingNotesRepository.findByStatus.mockRejectedValueOnce(
        Boom.default.forbidden('Access denied')
      )

      const response = await injectWithAuth(server, {
        method: 'GET',
        url: `${adminListUrl}?statuses=awaiting_acceptance`
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})
