import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'

describe('GET /v1/organisations/{organisationId}/accreditations/{accreditationId}/prns/{prnId}', () => {
  setupAuthContext()

  const organisationId = '6507f1f7-7bcf-46cd-b994-390100000001'
  const accreditationId = '507f1f77-bcf8-46cd-b994-390110000001'
  const prnId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  const differentOrgId = '77777777-7777-4777-b777-7777777777ff'
  const differentAccreditationId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee'

  const stubPrn = {
    _id: prnId,
    organisationId,
    registrationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    accreditationId,
    schemaVersion: 1,
    createdAt: '2026-01-21T10:30:00.000Z',
    createdBy: { id: '', name: '' },
    isExport: false,
    isDecemberWaste: false,
    prnNumber: '',
    accreditationYear: 2026,
    tonnage: 9,
    issuerNotes: 'REF: 101010',
    issuedToOrganisation: {
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'ComplyPak Ltd'
    },
    status: [
      {
        status: 'draft',
        createdAt: '2026-01-21T10:30:00.000Z',
        createdBy: { id: '', name: '' }
      }
    ]
  }

  const basePath = `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns/${prnId}`

  describe('with valid authentication and PRN data', () => {
    let server

    it('returns the PRN matching the given id', async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([stubPrn])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: basePath,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)

      const result = JSON.parse(response.payload)

      expect(result._id).toBe(prnId)
      expect(result.organisationId).toBe(organisationId)
      expect(result.accreditationId).toBe(accreditationId)
      expect(result.schemaVersion).toBe(1)
      expect(result.createdAt).toBe('2026-01-21T10:30:00.000Z')
      expect(result.createdBy).toEqual({ id: '', name: '' })
      expect(result.isExport).toBe(false)
      expect(result.isDecemberWaste).toBe(false)
      expect(result.prnNumber).toBe('')
      expect(result.accreditationYear).toBe(2026)
      expect(result.tonnage).toBe(9)
      expect(result.issuerNotes).toBe('REF: 101010')
      expect(result.issuedToOrganisation).toEqual({
        id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
        name: 'ComplyPak Ltd'
      })
      expect(result.status).toEqual([
        {
          status: 'draft',
          createdAt: '2026-01-21T10:30:00.000Z',
          createdBy: { id: '', name: '' }
        }
      ])
    })
  })

  describe('not found', () => {
    let server

    it('returns 404 when PRN does not exist', async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: basePath,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('authorization', () => {
    it('returns 404 when PRN belongs to a different organisation', async () => {
      const prnFromDifferentOrg = {
        ...stubPrn,
        organisationId: differentOrgId
      }

      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([
              prnFromDifferentOrg
            ])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: basePath,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 when PRN belongs to a different accreditation', async () => {
      const prnFromDifferentAccreditation = {
        ...stubPrn,
        accreditationId: differentAccreditationId
      }

      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([
              prnFromDifferentAccreditation
            ])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: basePath,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('validation errors', () => {
    let server

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([stubPrn])
        },
        featureFlags
      })
    })

    it('rejects invalid organisationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/invalid/accreditations/${accreditationId}/prns/${prnId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid accreditationId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/invalid/prns/${prnId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid prnId format', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns/invalid`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('authentication', () => {
    let server

    it('requires authentication', async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([stubPrn])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: basePath
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })
  })

  describe('feature flag', () => {
    it('returns 404 when feature flag is disabled', async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: false
      })

      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([stubPrn])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'GET',
        url: basePath,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
