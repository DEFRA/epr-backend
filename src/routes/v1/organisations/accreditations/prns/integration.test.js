import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'

describe('PRN endpoints - Integration', () => {
  setupAuthContext()

  const organisationId = '6507f1f7-7bcf-46cd-b994-390100000001'
  const accreditationId = '507f1f77-bcf8-46cd-b994-390110000001'

  const validPayload = {
    tonnage: 100,
    notes: 'REF: 101010',
    issuedTo: {
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    }
  }

  let server

  beforeEach(async () => {
    const featureFlags = createInMemoryFeatureFlags({
      createPackagingRecyclingNotes: true
    })

    server = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository()
      },
      featureFlags
    })
  })

  it('POST creates a PRN then GET by id retrieves it', async () => {
    const postResponse = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns`,
      payload: validPayload,
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    expect(postResponse.statusCode).toBe(StatusCodes.CREATED)

    const created = JSON.parse(postResponse.payload)

    expect(created.id).toBeDefined()
    expect(created.organisationId).toBe(organisationId)
    expect(created.accreditationId).toBe(accreditationId)
    expect(created.tonnage).toBe(100)
    expect(created.notes).toBe('REF: 101010')
    expect(created.issuedTo).toEqual({
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
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    expect(getResponse.statusCode).toBe(StatusCodes.OK)

    const retrieved = JSON.parse(getResponse.payload)

    expect(retrieved.organisationId).toBe(organisationId)
    expect(retrieved.accreditationId).toBe(accreditationId)
    expect(retrieved.tonnage).toBe(100)
    expect(retrieved.notes).toBe('REF: 101010')
    expect(retrieved.issuedTo).toEqual({
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
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
