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
const accreditationId = 'acc-789'
const prnId = 'prn-001'

const mockPrn = {
  id: prnId,
  accreditationYear: 2026,
  issuedByOrganisation: organisationId,
  issuedByAccreditation: accreditationId,
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
    findByAccreditation: vi.fn()
  })
}

describe(`${packagingRecyclingNoteByIdPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository(mockPrn)()

      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () =>
            lumpyPackagingRecyclingNotesRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          lumpyPackagingRecyclingNotes: true
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
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(
          lumpyPackagingRecyclingNotesRepository.findById
        ).toHaveBeenCalledWith(prnId)

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          prnNumber: null,
          accreditationYear: 2026,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: 'Test notes',
          isDecemberWaste: true,
          authorisedAt: '2026-01-16T14:30:00.000Z',
          authorisedBy: { name: 'John Smith', position: 'Director' },
          wasteProcessingType: 'reprocessor',
          processToBeUsed: 'R5'
        })
      })

      it('returns prnNumber when PRN has been issued', async () => {
        const issuedPrn = {
          id: prnId,
          prnNumber: 'ER1234567890A',
          accreditationYear: 2026,
          issuedByOrganisation: organisationId,
          issuedByAccreditation: accreditationId,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE },
          createdAt: new Date('2026-01-15T10:00:00Z')
        }
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          issuedPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          prnNumber: 'ER1234567890A',
          accreditationYear: 2026,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: null,
          isDecemberWaste: false,
          authorisedAt: null,
          authorisedBy: null,
          wasteProcessingType: null,
          processToBeUsed: 'R5'
        })
      })

      it('returns default values when optional fields are missing', async () => {
        const minimalPrn = {
          id: prnId,
          issuedByOrganisation: organisationId,
          issuedByAccreditation: accreditationId,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION },
          createdAt: new Date('2026-01-15T10:00:00Z')
          // Missing: issuerNotes, isDecemberWaste, authorisedAt, authorisedBy, wasteProcessingType
        }
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          minimalPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          prnNumber: null,
          accreditationYear: null,
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: null,
          isDecemberWaste: false,
          authorisedAt: null,
          authorisedBy: null,
          wasteProcessingType: null,
          processToBeUsed: 'R5'
        })
      })
    })

    describe('not found', () => {
      it('returns 404 when PRN does not exist', async () => {
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          null
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/non-existent`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN belongs to different organisation', async () => {
        const differentOrgId = 'different-org'

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${differentOrgId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: differentOrgId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN belongs to different accreditation', async () => {
        const differentAccId = 'different-acc'

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${differentAccId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN has been soft deleted', async () => {
        const deletedPrn = {
          ...mockPrn,
          status: { currentStatus: PRN_STATUS.DELETED }
        }
        lumpyPackagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          deletedPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        lumpyPackagingRecyclingNotesRepository.findById.mockRejectedValueOnce(
          Boom.default.forbidden('Access denied')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })

      it('returns 500 for unexpected errors', async () => {
        lumpyPackagingRecyclingNotesRepository.findById.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
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
          lumpyPackagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository()
        },
        featureFlags: createInMemoryFeatureFlags({
          lumpyPackagingRecyclingNotes: false
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
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/l-packaging-recycling-notes/${prnId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
