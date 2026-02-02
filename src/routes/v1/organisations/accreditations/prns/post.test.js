import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'

describe('POST /v1/organisations/{organisationId}/accreditations/{accreditationId}/prns', () => {
  setupAuthContext()

  const organisationId = '6507f1f77bcf86cd79943901'
  const accreditationId = '507f1f77bcf86cd799439011'

  const basePath = `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`

  const validPayload = {
    tonnage: 100,
    issuedToOrganisation: {
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    },
    issuerNotes: 'REF: 101010'
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

    it('creates a PRN and returns 201', async () => {
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
      expect(result.accreditationId).toBe(accreditationId)
      expect(result.tonnageValue).toBe(100)
      expect(result.issuerNotes).toBe('REF: 101010')
      expect(result.issuedToOrganisation).toEqual({
        id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
        name: 'Sauce Makers Limited',
        tradingName: 'Awesome Sauce'
      })
      expect(result.status.currentStatus).toBe('draft')
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
      expect(stored.tonnageValue).toBe(100)
      expect(stored.issuerNotes).toBe('REF: 101010')
      expect(stored.issuedToOrganisation).toEqual({
        id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
        name: 'Sauce Makers Limited',
        tradingName: 'Awesome Sauce'
      })
      expect(stored.status.currentStatus).toBe('draft')
      expect(stored.createdAt).toBeInstanceOf(Date)
    })

    it('accepts payload without optional tradingName', async () => {
      const { tradingName: _tradingName, ...orgWithoutTradingName } =
        validPayload.issuedToOrganisation
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: {
          ...validPayload,
          issuedToOrganisation: orgWithoutTradingName
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
        payload: { ...validPayload, issuerNotes: 'a'.repeat(201) },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing issuerNotes', async () => {
      const { issuerNotes: _issuerNotes, ...payloadWithoutNotes } = validPayload
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: payloadWithoutNotes,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing issuedToOrganisation', async () => {
      const {
        issuedToOrganisation: _issuedToOrganisation,
        ...payloadWithoutOrg
      } = validPayload
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
