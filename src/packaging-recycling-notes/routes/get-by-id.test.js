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
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { packagingRecyclingNoteByIdPath } from './get-by-id.js'

const organisationId = 'org-123'
const registrationId = 'reg-001'
const accreditationId = 'acc-789'
const prnId = 'prn-001'

const mockPrn = {
  id: prnId,
  schemaVersion: 2,
  organisation: { id: organisationId, name: 'Test Organisation' },
  registrationId,
  accreditation: {
    id: accreditationId,
    accreditationNumber: 'ACC-2026-001',
    accreditationYear: 2026,
    material: 'glass',
    submittedToRegulator: 'ea',
    glassRecyclingProcess: 'glass_re_melt'
  },
  issuedToOrganisation: {
    id: 'acme-001',
    name: 'Acme Packaging Ltd',
    tradingName: 'Acme'
  },
  tonnage: 50,
  isExport: false,
  isDecemberWaste: true,
  status: {
    currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
    issued: {
      at: new Date('2026-01-16T14:30:00Z'),
      by: { id: 'auth-user', name: 'John Smith', position: 'Director' }
    }
  },
  createdAt: new Date('2026-01-15T10:00:00Z'),
  createdBy: { id: 'user-1', name: 'Test User' },
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  updatedBy: null,
  notes: 'Test notes'
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
    let packagingRecyclingNotesRepository
    let organisationsRepository

    beforeAll(async () => {
      packagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository(mockPrn)()

      organisationsRepository = {
        findAccreditationById: vi.fn(async () => ({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea'
        }))
      }

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: () =>
            packagingRecyclingNotesRepository,
          organisationsRepository: () => organisationsRepository
        },
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotes: true
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
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(packagingRecyclingNotesRepository.findById).toHaveBeenCalledWith(
          prnId
        )

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          prnNumber: null,
          accreditationYear: 2026,
          issuedToOrganisation: {
            id: 'acme-001',
            name: 'Acme Packaging Ltd',
            tradingName: 'Acme'
          },
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: 'Test notes',
          isDecemberWaste: true,
          issuedAt: '2026-01-16T14:30:00.000Z',
          issuedBy: {
            id: 'auth-user',
            name: 'John Smith',
            position: 'Director'
          },
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          processToBeUsed: 'R5'
        })
      })

      it('returns null for optional fields when not present', async () => {
        const draftPrn = {
          id: prnId,
          schemaVersion: 2,
          organisation: { id: organisationId, name: 'Test Organisation' },
          registrationId,
          accreditation: {
            id: accreditationId,
            accreditationNumber: 'ACC-2026-001',
            accreditationYear: 2026,
            material: 'glass',
            submittedToRegulator: 'ea',
            glassRecyclingProcess: 'glass_re_melt'
          },
          issuedToOrganisation: {
            id: 'acme-001',
            name: 'Acme Packaging Ltd'
          },
          tonnage: 50,
          isExport: false,
          isDecemberWaste: false,
          status: {
            currentStatus: PRN_STATUS.DRAFT,
            currentStatusAt: new Date('2026-01-15T10:00:00Z'),
            history: [
              {
                status: PRN_STATUS.DRAFT,
                at: new Date('2026-01-15T10:00:00Z'),
                by: { id: 'user-1', name: 'Test User' }
              }
            ]
          },
          createdAt: new Date('2026-01-15T10:00:00Z'),
          createdBy: { id: 'user-1', name: 'Test User' },
          updatedAt: new Date('2026-01-15T10:00:00Z'),
          updatedBy: null
          // prnNumber, notes, status.issued not present
        }
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          draftPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload.prnNumber).toBeNull()
        expect(payload.notes).toBeNull()
        expect(payload.issuedAt).toBeNull()
        expect(payload.issuedBy).toBeNull()
      })

      it('returns prnNumber when PRN has been issued', async () => {
        const issuedPrn = {
          id: prnId,
          prnNumber: 'ER1234567890A',
          schemaVersion: 2,
          organisation: { id: organisationId, name: 'Test Organisation' },
          registrationId,
          accreditation: {
            id: accreditationId,
            accreditationNumber: 'ACC-2026-001',
            accreditationYear: 2026,
            material: 'glass',
            submittedToRegulator: 'ea',
            glassRecyclingProcess: 'glass_re_melt'
          },
          issuedToOrganisation: {
            id: 'acme-001',
            name: 'Acme Packaging Ltd'
          },
          tonnage: 50,
          isExport: false,
          isDecemberWaste: false,
          status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE },
          createdAt: new Date('2026-01-15T10:00:00Z'),
          createdBy: { id: 'user-1', name: 'Test User' },
          updatedAt: new Date('2026-01-15T10:00:00Z'),
          updatedBy: null
        }
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          issuedPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload).toStrictEqual({
          id: prnId,
          prnNumber: 'ER1234567890A',
          accreditationYear: 2026,
          issuedToOrganisation: {
            id: 'acme-001',
            name: 'Acme Packaging Ltd'
          },
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          createdAt: '2026-01-15T10:00:00.000Z',
          notes: null,
          isDecemberWaste: false,
          issuedAt: null,
          issuedBy: null,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          processToBeUsed: 'R5'
        })
      })
    })

    describe('not found', () => {
      it('returns 404 when PRN does not exist', async () => {
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(null)

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/non-existent`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN belongs to different organisation', async () => {
        const differentOrgId = 'different-org'

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${differentOrgId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: differentOrgId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN belongs to different accreditation', async () => {
        const differentAccId = 'different-acc'

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${differentAccId}/packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 404 when PRN has been soft deleted', async () => {
        const deletedPrn = {
          ...mockPrn,
          status: { currentStatus: PRN_STATUS.DELETED }
        }
        packagingRecyclingNotesRepository.findById.mockResolvedValueOnce(
          deletedPrn
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`
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
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
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
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
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
            createInMemoryPackagingRecyclingNotesRepository(),
          organisationsRepository: () => ({
            findAccreditationById: vi.fn(async () => ({
              wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
              submittedToRegulator: 'ea'
            }))
          })
        },
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotes: false
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
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
