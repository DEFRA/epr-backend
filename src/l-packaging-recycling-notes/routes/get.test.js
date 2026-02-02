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
import { packagingRecyclingNotesListPath } from './get.js'

const organisationId = 'org-123'
const registrationId = 'reg-001'

const mockPrns = [
  {
    id: 'prn-001',
    issuedByOrganisation: organisationId,
    issuedByRegistration: registrationId,
    issuedToOrganisation: 'Acme Packaging Ltd',
    tonnage: 50,
    material: 'glass',
    status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION },
    createdAt: new Date('2026-01-15T10:00:00Z')
  },
  {
    id: 'prn-002',
    issuedByOrganisation: organisationId,
    issuedByRegistration: registrationId,
    issuedToOrganisation: 'BigCo Waste Solutions',
    tonnage: 120,
    material: 'glass',
    status: { currentStatus: PRN_STATUS.ISSUED },
    createdAt: new Date('2026-01-18T14:30:00Z')
  }
]

const createInMemoryPackagingRecyclingNotesRepository = (prns = []) => {
  return () => ({
    create: vi.fn(),
    findById: vi.fn(),
    findByRegistration: vi.fn(async () => prns)
  })
}

describe(`${packagingRecyclingNotesListPath} route`, () => {
  setupAuthContext()

  describe('when feature flag is enabled', () => {
    let server
    let lumpyPackagingRecyclingNotesRepository

    beforeAll(async () => {
      lumpyPackagingRecyclingNotesRepository =
        createInMemoryPackagingRecyclingNotesRepository(mockPrns)()

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
      it('returns 200 with list of PRNs for registration', async () => {
        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(
          lumpyPackagingRecyclingNotesRepository.findByRegistration
        ).toHaveBeenCalledWith(registrationId)

        const payload = JSON.parse(response.payload)
        expect(payload).toHaveLength(2)
        expect(payload[0]).toStrictEqual({
          id: 'prn-001',
          issuedToOrganisation: 'Acme Packaging Ltd',
          tonnage: 50,
          material: 'glass',
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          createdAt: '2026-01-15T10:00:00.000Z'
        })
      })

      it('returns empty array when no PRNs exist', async () => {
        lumpyPackagingRecyclingNotesRepository.findByRegistration.mockResolvedValueOnce(
          []
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes`,
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
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes`
        })

        expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
      })
    })

    describe('error handling', () => {
      it('re-throws Boom errors from repository', async () => {
        const Boom = await import('@hapi/boom')
        lumpyPackagingRecyclingNotesRepository.findByRegistration.mockRejectedValueOnce(
          Boom.default.notFound('Registration not found')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes`,
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 500 for unexpected errors', async () => {
        lumpyPackagingRecyclingNotesRepository.findByRegistration.mockRejectedValueOnce(
          new Error('Database connection failed')
        )

        const response = await server.inject({
          method: 'GET',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes`,
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
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/l-packaging-recycling-notes`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
