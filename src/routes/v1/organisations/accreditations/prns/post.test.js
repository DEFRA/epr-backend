import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'
import { notesMaxLen } from './post'

describe('POST /v1/organisations/{organisationId}/accreditations/{accreditationId}/prns', () => {
  setupAuthContext()

  const organisationId = '6507f1f7-7bcf-46cd-b994-390100000001'
  const accreditationId = '507f1f77-bcf8-46cd-b994-390110000001'

  const basePath = `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`

  const validPayload = {
    tonnage: 100,
    issuerNotes: 'REF: 101010',
    issuedToOrganisation: {
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    }
  }

  describe('with valid authentication and payload', () => {
    let server
    let repositoryFactory

    beforeEach(async () => {
      const featureFlags = createInMemoryFeatureFlags({
        createPackagingRecyclingNotes: true
      })

      repositoryFactory = createInMemoryPackagingRecyclingNotesRepository([])

      server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository: repositoryFactory
        },
        featureFlags
      })
    })

    it('creates a PRN and returns 201 with all fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const result = JSON.parse(response.payload)

      expect(result.id).toBeDefined()
      expect(result.organisationId).toBe(organisationId)
      expect(result.registrationId).toBe('')
      expect(result.accreditationId).toBe(accreditationId)
      expect(result.schemaVersion).toBe(1)
      expect(result.createdAt).toBeDefined()
      expect(result.createdBy).toEqual({ id: '', name: '' })
      expect(result.isExport).toBe(false)
      expect(result.isDecemberWaste).toBe(false)
      expect(result.prnNumber).toBe('')
      expect(result.accreditationYear).toBe(0)
      expect(result.tonnage).toBe(100)
      expect(result.issuerNotes).toBe('REF: 101010')
      expect(result.issuedToOrganisation).toEqual({
        id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
        name: 'Sauce Makers Limited',
        tradingName: 'Awesome Sauce'
      })
      expect(result.status).toEqual([
        {
          status: 'draft',
          createdAt: result.createdAt,
          createdBy: { id: '', name: '' }
        }
      ])
    })

    it('persists the PRN in the repository', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      const { id } = JSON.parse(response.payload)

      const stored = await repositoryFactory().findById(id)

      expect(stored).not.toBeNull()
      expect(stored.organisationId).toBe(organisationId)
      expect(stored.accreditationId).toBe(accreditationId)
      expect(stored.tonnage).toBe(100)
      expect(stored.issuerNotes).toBe('REF: 101010')
      expect(stored.issuedToOrganisation).toEqual({
        id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
        name: 'Sauce Makers Limited',
        tradingName: 'Awesome Sauce'
      })
      expect(stored.status).toEqual([
        expect.objectContaining({ status: 'draft' })
      ])
      expect(stored.schemaVersion).toBe(1)
      expect(stored.isExport).toBe(false)
      expect(stored.isDecemberWaste).toBe(false)
      expect(stored.accreditationYear).toBe(0)
      expect(stored.prnNumber).toBe('')
    })

    it('accepts payload without optional tradingName', async () => {
      const { tradingName: _tradingName, ...issuedToWithoutTradingName } =
        validPayload.issuedToOrganisation
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: {
          ...validPayload,
          issuedToOrganisation: issuedToWithoutTradingName
        },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const result = JSON.parse(response.payload)

      expect(result.issuedToOrganisation).toEqual({
        id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
        name: 'Sauce Makers Limited'
      })
    })

    it('returns a unique id for each created PRN', async () => {
      const response1 = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      const response2 = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 50 },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      const result1 = JSON.parse(response1.payload)
      const result2 = JSON.parse(response2.payload)

      expect(result1.id).not.toBe(result2.id)
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
            createInMemoryPackagingRecyclingNotesRepository([])
        },
        featureFlags
      })
    })

    it('rejects invalid organisationId format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/invalid/accreditations/${accreditationId}/prns`,
        payload: validPayload,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid accreditationId format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/accreditations/invalid/prns`,
        payload: validPayload,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing tonnage', async () => {
      const { tonnage: _tonnage, ...payloadWithoutTonnage } = validPayload
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: payloadWithoutTonnage,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects non-integer tonnage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 10.5 },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects zero tonnage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 0 },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects negative tonnage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: -1 },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects issuerNotes longer than 200 characters', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: {
          ...validPayload,
          issuerNotes: 'a'.repeat(notesMaxLen + 1)
        },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing issuerNotes', async () => {
      const { issuerNotes: _notes, ...payloadWithoutNotes } = validPayload
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: payloadWithoutNotes,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing issuedToOrganisation', async () => {
      const { issuedToOrganisation: _issuedTo, ...payloadWithoutOrg } =
        validPayload
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: payloadWithoutOrg,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid issuedToOrganisation.id format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: {
          ...validPayload,
          issuedToOrganisation: {
            ...validPayload.issuedToOrganisation,
            id: 'not-a-uuid'
          }
        },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing issuedToOrganisation.name', async () => {
      const { name: _name, ...orgWithoutName } =
        validPayload.issuedToOrganisation
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: {
          ...validPayload,
          issuedToOrganisation: orgWithoutName
        },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('authentication', () => {
    let server

    beforeEach(async () => {
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
    })

    it('requires authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload
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
            createInMemoryPackagingRecyclingNotesRepository([])
        },
        featureFlags
      })

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
