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
import { packagingRecyclingNoteByIdPath } from './get-by-id.js'

const organisationId = 'org-123'
const registrationId = 'reg-001'
const prnId = 'prn-001'

const mockPrn = {
  id: prnId,
  issuedByOrganisation: organisationId,
  issuedByRegistration: registrationId,
  issuedToOrganisation: 'Acme Packaging Ltd',
  tonnage: 50,
  material: 'glass',
  status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION },
  createdAt: new Date('2026-01-15T10:00:00Z'),
  issuerNotes: 'Test notes',
  isDecemberWaste: true,
  authorisedAt: new Date('2026-01-16T14:30:00Z'),
  authorisedBy: { name: 'John Smith', position: 'Director' },
  wasteProcessingType: 'reprocessor'
}

const createInMemoryPackagingRecyclingNotesRepository = (prn = null) => {
  return () => ({
    create: vi.fn(),
    findById: vi.fn(async () => prn),
    findByRegistration: vi.fn()
  })
}

describe(`${packagingRecyclingNoteByIdPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let packagingRecyclingNotesRepository

    beforeAll(async () => {
      packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository(mockPrn)()

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
      it('returns 200 with PRN data', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(packagingRecyclingNotesRepository.findById).toHaveBeenCalledWith(
          prnId
        )

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: 'Test notes',
          isDecemberWaste: true,
          authorisedAt: '2026-01-16T14:30:00.000Z',
          authorisedBy: { name: 'John Smith', position: 'Director' },
          wasteProcessingType: 'reprocessor'
        })
      })

      it('returns default values when optional fields are missing', async () => {
        const minimalPrn = {
          id: prnId,
          issuedByOrganisation: organisationId,
          issuedByRegistration: registrationId,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION },
          createdAt: new Date('2026-01-15T10:00:00Z')
          // Missing: issuerNotes, isDecemberWaste, authorisedAt, authorisedBy, wasteProcessingType
        }
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          minimalPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: null,
          isDecemberWaste: false,
          authorisedAt: null,
          authorisedBy: null,
          wasteProcessingType: null
        })
      })
    })

    describe('not found', () => {
      it('returns 404 when PRN does not exist', async () => {
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(null)

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/non-existent`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/${prnId}`
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        packagingRecyclingNotesRepository.findById.mockRejectedValueOnce(
          Boom.default.forbidden('Access denied')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })

      it('returns 500 for unexpected errors', async () => {
        packagingRecyclingNotesRepository.findById.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
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
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository()
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

    it('returns 404 when feature flag is disabled', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes/${prnId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
