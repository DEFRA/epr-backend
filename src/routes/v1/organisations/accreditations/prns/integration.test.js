import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import Boom from '@hapi/boom'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'

describe('PRN endpoints - Integration', () => {
  setupAuthContext()

  const organisationId = '6507f1f7-7bcf-46cd-b994-390100000001'
  const accreditationId = '507f1f77-bcf8-46cd-b994-390110000001'
  const registrationId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'

  const validPayload = {
    tonnage: 100,
    issuerNotes: 'REF: 101010',
    issuedToOrganisation: {
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    }
  }

  const authOptions = () =>
    asStandardUser(
      /** @type {any} */ ({
        linkedOrgId: organisationId,
        profile: { id: 'test-user-id', name: 'Test User' }
      })
    )

  const createOrganisationsRepository = () => ({
    findById: async (id) => {
      if (id !== organisationId) {
        throw Boom.notFound(`Organisation with id ${id} not found`)
      }
      return {
        id: organisationId,
        registrations: [
          {
            id: registrationId,
            accreditationId,
            wasteProcessingType: 'reprocessor'
          }
        ]
      }
    }
  })

  let server

  beforeEach(async () => {
    const featureFlags = createInMemoryFeatureFlags({
      createPackagingRecyclingNotes: true
    })

    server = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository(),
        organisationsRepository: createOrganisationsRepository()
      },
      featureFlags
    })
  })

  it('POST creates a PRN then GET by id retrieves it', async () => {
    const postResponse = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
      payload: validPayload,
      ...authOptions()
    })

    expect(postResponse.statusCode).toBe(StatusCodes.CREATED)

    const created = JSON.parse(postResponse.payload)

    expect(created.id).toBeDefined()
    expect(created.organisationId).toBe(organisationId)
    expect(created.registrationId).toBe(registrationId)
    expect(created.accreditationId).toBe(accreditationId)
    expect(created.tonnage).toBe(100)
    expect(created.issuerNotes).toBe('REF: 101010')
    expect(created.issuedToOrganisation).toEqual({
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    })
    expect(created.status).toEqual([
      expect.objectContaining({ status: 'draft' })
    ])

    const getResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns/${created.id}`,
      ...authOptions()
    })

    expect(getResponse.statusCode).toBe(StatusCodes.OK)

    const retrieved = JSON.parse(getResponse.payload)

    expect(retrieved.organisationId).toBe(organisationId)
    expect(retrieved.registrationId).toBe(registrationId)
    expect(retrieved.accreditationId).toBe(accreditationId)
    expect(retrieved.tonnage).toBe(100)
    expect(retrieved.issuerNotes).toBe('REF: 101010')
    expect(retrieved.issuedToOrganisation).toEqual({
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    })
    expect(retrieved.status).toEqual([
      expect.objectContaining({ status: 'draft' })
    ])
  })

  it('GET by id returns 404 for non-existent PRN', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns/00000000-0000-4000-8000-000000000000`,
      ...authOptions()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
