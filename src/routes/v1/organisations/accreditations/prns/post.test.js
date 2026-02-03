import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'
import { issuerNotesMaxLen } from './post'

describe('POST /v1/organisations/{organisationId}/accreditations/{accreditationId}/prns', () => {
  setupAuthContext()

  const organisationId = '6507f1f7-7bcf-46cd-b994-390100000001'
  const accreditationId = '507f1f77-bcf8-46cd-b994-390110000001'
  const registrationId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

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

  const authOptions = (orgId = organisationId) =>
    asStandardUser(
      /** @type {any} */ ({
        linkedOrgId: orgId,
        profile: { id: 'test-user-id', name: 'Test User' }
      })
    )

  const createOrganisationsRepository = (
    registrations = [
      {
        id: registrationId,
        accreditationId,
        wasteProcessingType: 'reprocessor'
      }
    ]
  ) => ({
    findById: async (id) => {
      if (id !== organisationId) {
        throw Boom.notFound(`Organisation with id ${id} not found`)
      }
      return { id: organisationId, registrations }
    }
  })

  const createWasteBalancesRepository = (availableAmount = 1000) => ({
    findByAccreditationId: async () =>
      availableAmount === null ? null : { availableAmount }
  })

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
          packagingRecyclingNotesRepository: repositoryFactory,
          organisationsRepository: createOrganisationsRepository(),
          wasteBalancesRepository: createWasteBalancesRepository()
        },
        featureFlags
      })
    })

    it('creates a PRN and returns 201 with all fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const result = JSON.parse(response.payload)

      expect(result.id).toBeDefined()
      expect(result.organisationId).toBe(organisationId)
      expect(result.registrationId).toBe(registrationId)
      expect(result.accreditationId).toBe(accreditationId)
      expect(result.schemaVersion).toBe(1)
      expect(result.createdAt).toBeDefined()
      expect(result.createdBy).toEqual({
        id: 'test-user-id',
        name: 'Test User'
      })
      expect(result.isExport).toBe(false)
      expect(result.isDecemberWaste).toBe(false)
      expect(result.prnNumber).toBe('')
      expect(result.accreditationYear).toBe(2026)
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
          createdBy: { id: 'test-user-id', name: 'Test User' }
        }
      ])
    })

    it('persists the PRN in the repository', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...authOptions()
      })

      const { id } = JSON.parse(response.payload)

      const stored = await repositoryFactory().findById(id)

      expect(stored).not.toBeNull()
      expect(stored.organisationId).toBe(organisationId)
      expect(stored.registrationId).toBe(registrationId)
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
      expect(stored.accreditationYear).toBe(2026)
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
        ...authOptions()
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
        ...authOptions()
      })

      const response2 = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 50 },
        ...authOptions()
      })

      const result1 = JSON.parse(response1.payload)
      const result2 = JSON.parse(response2.payload)

      expect(result1.id).not.toBe(result2.id)
    })

    it('sets isExport to true when registration wasteProcessingType is exporter', async () => {
      const exporterServer = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([]),
          organisationsRepository: createOrganisationsRepository([
            {
              id: registrationId,
              accreditationId,
              wasteProcessingType: 'exporter'
            }
          ]),
          wasteBalancesRepository: createWasteBalancesRepository()
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: true
        })
      })

      const response = await exporterServer.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const result = JSON.parse(response.payload)

      expect(result.isExport).toBe(true)
    })
  })

  describe('registration lookup', () => {
    it('returns 404 when no registration matches the accreditationId', async () => {
      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([]),
          organisationsRepository: createOrganisationsRepository([
            {
              id: registrationId,
              accreditationId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
              wasteProcessingType: 'reprocessor'
            }
          ]),
          wasteBalancesRepository: createWasteBalancesRepository()
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: true
        })
      })

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('waste balance validation', () => {
    it('returns 400 when tonnage exceeds available waste balance', async () => {
      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([]),
          organisationsRepository: createOrganisationsRepository(),
          wasteBalancesRepository: createWasteBalancesRepository(50)
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: true
        })
      })

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 51 },
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const result = JSON.parse(response.payload)
      expect(result.message).toBe(
        'The tonnage exceeds the available waste balance'
      )
    })

    it('returns 400 when no waste balance exists for the accreditation', async () => {
      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([]),
          organisationsRepository: createOrganisationsRepository(),
          wasteBalancesRepository: createWasteBalancesRepository(null)
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: true
        })
      })

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: validPayload,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const result = JSON.parse(response.payload)
      expect(result.message).toBe(
        'The tonnage exceeds the available waste balance'
      )
    })

    it('succeeds when tonnage equals available amount exactly', async () => {
      const server = await createTestServer({
        repositories: {
          packagingRecyclingNotesRepository:
            createInMemoryPackagingRecyclingNotesRepository([]),
          organisationsRepository: createOrganisationsRepository(),
          wasteBalancesRepository: createWasteBalancesRepository(100)
        },
        featureFlags: createInMemoryFeatureFlags({
          createPackagingRecyclingNotes: true
        })
      })

      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 100 },
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
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
            createInMemoryPackagingRecyclingNotesRepository([]),
          organisationsRepository: createOrganisationsRepository(),
          wasteBalancesRepository: createWasteBalancesRepository()
        },
        featureFlags
      })
    })

    it('rejects invalid organisationId format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/invalid/accreditations/${accreditationId}/prns`,
        payload: validPayload,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects invalid accreditationId format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/accreditations/invalid/prns`,
        payload: validPayload,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing tonnage', async () => {
      const { tonnage: _tonnage, ...payloadWithoutTonnage } = validPayload
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: payloadWithoutTonnage,
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects non-integer tonnage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 10.5 },
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects zero tonnage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: 0 },
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects negative tonnage', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: { ...validPayload, tonnage: -1 },
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects issuerNotes longer than 200 characters', async () => {
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: {
          ...validPayload,
          issuerNotes: 'a'.repeat(issuerNotesMaxLen + 1)
        },
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects missing issuerNotes', async () => {
      const { issuerNotes: _notes, ...payloadWithoutNotes } = validPayload
      const response = await server.inject({
        method: 'POST',
        url: basePath,
        payload: payloadWithoutNotes,
        ...authOptions()
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
        ...authOptions()
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
        ...authOptions()
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
        ...authOptions()
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
        ...authOptions()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
