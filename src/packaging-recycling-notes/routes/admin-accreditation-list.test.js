import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createTestServer } from '#test/create-test-server.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createMockIssuedPrn } from './test-helpers.js'

const { validToken } = entraIdMockAuthTokens

const accreditation = {
  organisationId: 'org-123',
  registrationId: 'reg-456',
  accreditationId: 'acc-789'
}

const listUrl = ({ organisationId, registrationId, accreditationId }) =>
  `/v1/admin/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`

const injectWithAuth = (server, options) =>
  server.inject({
    ...options,
    headers: {
      Authorization: `Bearer ${validToken}`,
      ...options.headers
    }
  })

describe('GET /v1/admin/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes', () => {
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
        wasteBalanceService: () => ({}),
        organisationsRepository: () => ({})
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('names the accreditation by the organisation and registration above it', async () => {
    packagingRecyclingNotesRepository.findByAccreditation.mockResolvedValueOnce(
      [createMockIssuedPrn()]
    )

    const response = await injectWithAuth(server, {
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=awaiting_acceptance`
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(
      packagingRecyclingNotesRepository.findByAccreditation
    ).toHaveBeenCalledWith(accreditation)
    expect(
      packagingRecyclingNotesRepository.findByStatus
    ).not.toHaveBeenCalled()

    const payload = JSON.parse(response.payload)
    expect(payload.items).toHaveLength(1)
    expect(payload.hasMore).toBe(false)
    expect(payload.nextCursor).toBeUndefined()
  })

  it('filters the accreditation PRNs by the requested statuses', async () => {
    packagingRecyclingNotesRepository.findByAccreditation.mockResolvedValueOnce(
      [
        createMockIssuedPrn({
          id: 'prn-accepted',
          status: { currentStatus: PRN_STATUS.ACCEPTED, history: [] }
        }),
        createMockIssuedPrn({
          id: 'prn-cancelled',
          status: { currentStatus: PRN_STATUS.CANCELLED, history: [] }
        })
      ]
    )

    const response = await injectWithAuth(server, {
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=accepted`
    })

    const payload = JSON.parse(response.payload)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].id).toBe('prn-accepted')
  })

  it('returns the admin PRN fields', async () => {
    const mockPrn = createMockIssuedPrn()
    packagingRecyclingNotesRepository.findByAccreditation.mockResolvedValueOnce(
      [mockPrn]
    )

    const response = await injectWithAuth(server, {
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=awaiting_acceptance`
    })

    const payload = JSON.parse(response.payload)
    expect(payload.items[0].organisationName).toBe(mockPrn.organisation.name)
    expect(payload.items[0].issuedToOrganisation).toEqual(
      mockPrn.issuedToOrganisation
    )
    expect(payload.items[0].issuedAt).toBe(
      mockPrn.status.issued.at.toISOString()
    )
  })

  it('returns 401 when no auth token is provided', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=awaiting_acceptance`
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('returns 422 when statuses is missing', async () => {
    const response = await injectWithAuth(server, {
      method: 'GET',
      url: listUrl(accreditation)
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 422 when statuses contains an invalid value', async () => {
    const response = await injectWithAuth(server, {
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=invalid_status`
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 500 when findByAccreditation throws', async () => {
    packagingRecyclingNotesRepository.findByAccreditation.mockRejectedValueOnce(
      new Error('Database connection lost')
    )

    const response = await injectWithAuth(server, {
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=accepted`
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })

  it('re-throws Boom errors from the repository', async () => {
    packagingRecyclingNotesRepository.findByAccreditation.mockRejectedValueOnce(
      Boom.notFound('Accreditation not found')
    )

    const response = await injectWithAuth(server, {
      method: 'GET',
      url: `${listUrl(accreditation)}?statuses=accepted`
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
