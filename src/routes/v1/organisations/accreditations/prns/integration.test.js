import { describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createPackagingRecyclingNotesRepository } from '#repositories/packaging-recycling-notes/mongodb.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { asStandardUser } from '#test/inject-auth.js'

const DATABASE_NAME = 'epr-backend'
const PRN_COLLECTION_NAME = 'packaging-recycling-notes'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  server: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    const database = client.db(DATABASE_NAME)

    const repositoryFactory =
      await createPackagingRecyclingNotesRepository(database)

    const featureFlags = createInMemoryFeatureFlags({
      createPackagingRecyclingNotes: true
    })

    const server = await createTestServer({
      repositories: {
        packagingRecyclingNotesRepository: repositoryFactory
      },
      featureFlags
    })

    await use(server)
    await client.close()
  }
})

describe('PRN endpoints - Integration', () => {
  setupAuthContext()

  const organisationId = '6507f1f77bcf86cd79943901'
  const accreditationId = '507f1f77bcf86cd799439011'

  const validPayload = {
    tonnage: 100,
    issuedToOrganisation: {
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    },
    issuerNotes: 'REF: 101010'
  }

  it('POST creates a PRN then GET by id retrieves it from MongoDB', async ({
    server,
    mongoClient
  }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(PRN_COLLECTION_NAME)
      .deleteMany({})

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
    expect(created.tonnageValue).toBe(100)
    expect(created.issuerNotes).toBe('REF: 101010')
    expect(created.issuedToOrganisation).toEqual({
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    })
    expect(created.status.currentStatus).toBe('draft')

    const getResponse = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns/${created.id}`,
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    expect(getResponse.statusCode).toBe(StatusCodes.OK)

    const retrieved = JSON.parse(getResponse.payload)

    expect(retrieved.organisationId).toBe(organisationId)
    expect(retrieved.accreditationId).toBe(accreditationId)
    expect(retrieved.tonnageValue).toBe(100)
    expect(retrieved.issuerNotes).toBe('REF: 101010')
    expect(retrieved.issuedToOrganisation).toEqual({
      id: 'ebdfb7d9-3d55-4788-ad33-dbd7c885ef20',
      name: 'Sauce Makers Limited',
      tradingName: 'Awesome Sauce'
    })
    expect(retrieved.status.currentStatus).toBe('draft')
  })

  it('GET by id returns 404 for non-existent PRN', async ({
    server,
    mongoClient
  }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(PRN_COLLECTION_NAME)
      .deleteMany({})

    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/accreditations/${accreditationId}/prns/00000000-0000-4000-8000-000000000000`,
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
