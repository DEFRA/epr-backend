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
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'
import {
  MATERIAL,
  NATION,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { packagingRecyclingNotesUpdateStatusPath } from './status.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'
const prnId = '507f1f77bcf86cd799439011'

const createMockPrn = (overrides = {}) => ({
  id: prnId,
  issuedByOrganisation: organisationId,
  issuedByRegistration: registrationId,
  issuedToOrganisation: 'producer-org-789',
  tonnage: 100,
  material: MATERIAL.PLASTIC,
  nation: NATION.ENGLAND,
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  isExport: false,
  issuerNotes: 'Test notes',
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    history: [{ status: PRN_STATUS.DRAFT, updatedAt: new Date() }]
  },
  createdAt: new Date(),
  createdBy: 'user-123',
  updatedAt: new Date(),
  ...overrides
})

const createInMemoryPackagingRecyclingNotesRepository = (initialPrns = []) => {
  const store = new Map(initialPrns.map((prn) => [prn.id, { ...prn }]))

  return () => ({
    create: vi.fn(async (prn) => {
      const id = `prn-${Date.now()}`
      const created = { ...prn, id }
      store.set(id, created)
      return created
    }),
    findById: vi.fn(async (id) => {
      const prn = store.get(id)
      return prn ? { ...prn } : null
    }),
    updateStatus: vi.fn(async ({ id, status, updatedBy, updatedAt }) => {
      const prn = store.get(id)
      if (!prn) return null

      prn.status.currentStatus = status
      prn.status.history.push({ status, updatedAt, updatedBy })
      prn.updatedAt = updatedAt
      store.set(id, prn)

      return { ...prn }
    })
  })
}

describe(`${packagingRecyclingNotesUpdateStatusPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let packagingRecyclingNotesRepository
    const mockPrn = createMockPrn()

    beforeAll(async () => {
      packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository([mockPrn])()

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: true
        })
      })

      await server.initialize()
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
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const body = JSON.parse(response.payload)
        expect(body.id).toBe(prnId)
        expect(body.status).toBe(PRN_STATUS.AWAITING_AUTHORISATION)

        expect(
          packagingRecyclingNotesRepository.updateStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: prnId,
            status: PRN_STATUS.AWAITING_AUTHORISATION
          })
        )
      })
    })

    describe('error handling', () => {
      it('returns 404 when PRN not found', async () => {
        const nonExistentId = '507f1f77bcf86cd799439099'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${nonExistentId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN belongs to different organisation', async () => {
        const differentOrgId = 'different-org'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${differentOrgId}/registrations/${registrationId}/packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: differentOrgId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 400 for invalid status transition', async () => {
        // Create a PRN that's already in CREATED status
        const createdPrnId = '507f1f77bcf86cd799439022'
        const createdPrn = createMockPrn({
          id: createdPrnId,
          status: {
            currentStatus: PRN_STATUS.ACCEPTED,
            history: [{ status: PRN_STATUS.ACCEPTED, updatedAt: new Date() }]
          }
        })

        // Add to repository
        packagingRecyclingNotesRepository.findById.mockImplementation(
          async (id) => {
            if (id === createdPrnId) return createdPrn
            if (id === prnId) return mockPrn
            return null
          }
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${createdPrnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.DRAFT }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('Invalid status transition')
      })

      it('returns 400 when PRN has unknown current status', async () => {
        const unknownStatusPrnId = '507f1f77bcf86cd799439033'
        const unknownStatusPrn = createMockPrn({
          id: unknownStatusPrnId,
          status: {
            currentStatus: 'unknown_status',
            history: [{ status: 'unknown_status', updatedAt: new Date() }]
          }
        })

        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          unknownStatusPrn
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${unknownStatusPrnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(response.payload).toContain('Invalid status transition')
      })

      it('returns 422 for invalid PRN id format', async () => {
        const invalidId = 'invalid-id'

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${invalidId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid status value', async () => {
        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: 'invalid_status' }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 500 when updateStatus returns null', async () => {
        // Reset PRN to draft status for this test
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          createMockPrn()
        )
        packagingRecyclingNotesRepository.updateStatus.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${prnId}/status`,
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
        packagingRecyclingNotesRepository.updateStatus.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${prnId}/status`,
          ...asStandardUser({ linkedOrgId: organisationId }),
          payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
        })

        expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    let server

    beforeAll(async () => {
      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: () => ({
            findById: vi.fn(),
            create: vi.fn(),
            updateStatus: vi.fn()
          })
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: false
        })
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 404', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/packaging-recycling-notes/${prnId}/status`,
        ...asStandardUser({ linkedOrgId: organisationId }),
        payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
