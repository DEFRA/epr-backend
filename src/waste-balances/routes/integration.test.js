import { describe, beforeEach, afterEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createServer } from '#server/server.js'
import {
  createMongoStreamRepository,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/stream-mongodb.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

const { validToken } = entraIdMockAuthTokens

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async (/** @type {{ db: string }} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

describe('GET /v1/organisations/{organisationId}/waste-balances - Integration', () => {
  setupAuthContext()

  const organisationId = '6507f1f77bcf86cd79943901'
  const accreditationId1 = '507f1f77bcf86cd799439011'
  const accreditationId2 = '507f191e810c19729de860ea'
  const nonExistentId = '000000000000000000000000'
  const registrationId1 = 'reg-1'
  const registrationId2 = 'reg-2'

  /** @type {import('@hapi/hapi').Server} */
  let server
  /** @type {import('mongodb').MongoClient} */
  let dbClient

  beforeEach(
    async (
      /** @type {{ mongoClient: import('mongodb').MongoClient }} */ {
        mongoClient
      }
    ) => {
      dbClient = mongoClient
      const database = mongoClient.db(DATABASE_NAME)
      const collection = database.collection(WASTE_BALANCE_COLLECTION_NAME)

      await collection.deleteMany({})
      await database
        .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
        .deleteMany({})

      await collection.insertMany([
        {
          accreditationId: accreditationId1,
          organisationId,
          registrationId: registrationId1,
          amount: 0,
          availableAmount: 0,
          version: 1,
          schemaVersion: 1
        },
        {
          accreditationId: accreditationId2,
          organisationId,
          registrationId: registrationId2,
          amount: 0,
          availableAmount: 0,
          version: 1,
          schemaVersion: 1
        }
      ])

      const streamRepository = (await createMongoStreamRepository(database))()
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: accreditationId1,
          organisationId,
          registrationId: registrationId1,
          number: 1,
          closingBalance: { amount: 1000, availableAmount: 750 }
        })
      )
      await streamRepository.appendEvent(
        buildStreamEvent({
          accreditationId: accreditationId2,
          organisationId,
          registrationId: registrationId2,
          number: 1,
          closingBalance: { amount: 2500, availableAmount: 2500 }
        })
      )

      server = await createServer({ mongoUri: globalThis.__MONGO_URI__ })
      await server.initialize()
    }
  )

  afterEach(async () => {
    await server.stop()
  })

  it('fetches waste balances from MongoDB for multiple IDs', async () => {
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

  it('fetches single waste balance from MongoDB', async () => {
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

  it('returns empty object for non-existent IDs in MongoDB', async () => {
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

  it('handles mixed existing and non-existing IDs from MongoDB', async () => {
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

  it('returns empty object when collection is empty', async () => {
    await dbClient
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
})
