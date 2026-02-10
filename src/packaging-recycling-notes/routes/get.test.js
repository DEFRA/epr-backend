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
import { packagingRecyclingNotesListPath } from './get.js'

const organisationId = 'org-123'
const registrationId = 'reg-001'
const accreditationId = 'acc-789'

const mockPrns = [
  {
    id: 'prn-001',
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
    status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION },
    createdAt: new Date('2026-01-15T10:00:00Z'),
    createdBy: { id: 'user-1', name: 'Test User' },
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    updatedBy: null
  },
  {
    id: 'prn-002',
    prnNumber: 'ER2654321',
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
      id: 'bigco-001',
      name: 'BigCo Waste Solutions'
    },
    tonnage: 120,
    isExport: false,
    isDecemberWaste: false,
    status: {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      issued: {
        at: new Date('2026-01-20T09:00:00Z'),
        by: { id: 'user-1', name: 'Test User' }
      }
    },
    createdAt: new Date('2026-01-18T14:30:00Z'),
    createdBy: { id: 'user-1', name: 'Test User' },
    updatedAt: new Date('2026-01-18T14:30:00Z'),
    updatedBy: null
  }
]

const createInMemoryPackagingRecyclingNotesRepository = (prns = []) => {
  return () => ({
    create: vi.fn(),
    findById: vi.fn(),
    findByAccreditation: vi.fn(async () => prns)
  })
}

describe(`${packagingRecyclingNotesListPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository
    let organisationsRepository

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository(mockPrns)()

      organisationsRepository = {
        findAccreditationById: vi.fn(async () => ({
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          submittedToRegulator: 'ea'
        }))
      }

      server = await createTestServer({
        repositories: {
          lumpyPackagingRecyclingNotesRepository: () =>
            lumpyPackagingRecyclingNotesRepository,
          organisationsRepository: () => organisationsRepository
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
      it('returns 200 with list of PRNs for registration', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(
          lumpyPackagingRecyclingNotesRepository.findByAccreditation
        ).toHaveBeenCalledWith(accreditationId)

        const payload = JSON.parse(response.payload)
        expect(payload).toHaveLength(2)
        expect(payload[0]).toStrictEqual({
          id: 'prn-001',
          prnNumber: null,
          issuedToOrganisation: {
            id: 'acme-001',
            name: 'Acme Packaging Ltd'
          },
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z',
          issuedAt: null,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
        })
        expect(payload[1]).toStrictEqual({
          id: 'prn-002',
          prnNumber: 'ER2654321',
          issuedToOrganisation: {
            id: 'bigco-001',
            name: 'BigCo Waste Solutions'
          },
          tonnage: 120,
          material: 'glass',
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          createdAt: '2026-01-18T14:30:00.000Z',
          issuedAt: '2026-01-20T09:00:00.000Z',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
        })
      })

      it('returns empty array when no PRNs exist', async () => {
        lumpyPackagingRecyclingNotesRepository.findByAccreditation.mockResolvedValueOnce(
          []
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)

        const payload = JSON.parse(response.payload)
        expect(payload).toHaveLength(0)
      })
    })

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        lumpyPackagingRecyclingNotesRepository.findByAccreditation.mockRejectedValueOnce(
          Boom.default.notFound('Registration not found')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 500 for unexpected errors', async () => {
        lumpyPackagingRecyclingNotesRepository.findByAccreditation.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
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
            createInMemoryPackagingRecyclingNotesRepository(),
          organisationsRepository: () => ({
            findAccreditationById: vi.fn(async () => ({
              wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
              submittedToRegulator: 'ea'
            }))
          })
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
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
