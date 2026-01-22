import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createServer } from '#server/server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

const { validToken } = entraIdMockAuthTokens

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  server: async ({ db }, use) => {
    const server = await createServer({
      mongoUri: db
    })
    await server.initialize()
    await use(server)
    await server.stop()
  }
})

describe('GET /v1/organisations/{organisationId}/waste-balances - Integration', () => {
  setupAuthContext()

  const organisationId = '6507f1f77bcf86cd79943901'
  const accreditationId1 = '507f1f77bcf86cd799439011'
  const accreditationId2 = '507f191e810c19729de860ea'
  const nonExistentId = '000000000000000000000000'

  beforeEach(async ({ mongoClient }) => {
    const collection = mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_COLLECTION_NAME)

    await collection.deleteMany({})

    await collection.insertMany([
      {
        accreditationId: accreditationId1,
        organisationId,
        amount: 1000,
        availableAmount: 750,
        transactions: [],
        version: 1,
        schemaVersion: 1
      },
      {
        accreditationId: accreditationId2,
        organisationId,
        amount: 2500,
        availableAmount: 2500,
        transactions: [],
        version: 1,
        schemaVersion: 1
      }
    ])
  })

  it('fetches waste balances from MongoDB for multiple IDs', async ({
    server
  }) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${accreditationId2}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result[accreditationId1]).toEqual({
      amount: 1000,
      availableAmount: 750
    })
    expect(result[accreditationId2]).toEqual({
      amount: 2500,
      availableAmount: 2500
    })
  })

  it('fetches single waste balance from MongoDB', async ({ server }) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result[accreditationId1]).toEqual({
      amount: 1000,
      availableAmount: 750
    })
  })

  it('returns empty object for non-existent IDs in MongoDB', async ({
    server
  }) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${nonExistentId}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result).toEqual({})
  })

  it('handles mixed existing and non-existing IDs from MongoDB', async ({
    server
  }) => {
    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1},${nonExistentId}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result[accreditationId1]).toEqual({
      amount: 1000,
      availableAmount: 750
    })
    expect(result[nonExistentId]).toBeUndefined()
  })

  it('returns empty object when collection is empty', async ({
    server,
    mongoClient
  }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .deleteMany({})

    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationId1}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)

    expect(result).toEqual({})
  })

  it('returns 403 when accreditation belongs to different organisation in MongoDB', async ({
    server,
    mongoClient
  }) => {
    const differentOrgId = '7777777777777777777777ff'
    const accreditationIdDifferentOrg = 'cccccccccccccccccccccccc'

    const collection = mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_COLLECTION_NAME)

    await collection.deleteMany({})
    await collection.insertOne({
      accreditationId: accreditationIdDifferentOrg,
      organisationId: differentOrgId,
      amount: 5000,
      availableAmount: 4000,
      transactions: [],
      version: 1,
      schemaVersion: 1
    })

    const response = await server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/waste-balances?accreditationIds=${accreditationIdDifferentOrg}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    const result = JSON.parse(response.payload)
    expect(result.error).toBe('Forbidden')
    expect(result.message).toContain(accreditationIdDifferentOrg)
    expect(result.message).toContain(organisationId)
  })
})
