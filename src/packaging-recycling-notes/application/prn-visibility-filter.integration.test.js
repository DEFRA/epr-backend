import { describe, beforeEach, afterAll, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { StatusCodes } from 'http-status-codes'

import { createPrnVisibilityFilter } from './prn-visibility-filter.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import {
  cognitoJwksUrl,
  setupAuthContext
} from '#vite/helpers/setup-auth-mocking.js'
import { generateExternalApiToken } from '#packaging-recycling-notes/routes/test-helpers.js'

const DATABASE_NAME = 'epr-backend'
const ORGANISATIONS_COLLECTION = 'epr-organisations'
const PRNS_COLLECTION = 'packaging-recycling-notes'
const TEST_ORG_NUMERIC_ID = 500001
const REAL_ORG_NUMERIC_ID = 500002

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

describe('PRN visibility filter - integration with real MongoDB', () => {
  setupAuthContext()

  let db
  let server
  let testOrgHexId
  let realOrgHexId

  const externalApiClientId = randomUUID()
  const authHeaders = {
    authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
  }

  beforeEach(async ({ mongoClient }) => {
    db = mongoClient.db(DATABASE_NAME)
    await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
    await db.collection(PRNS_COLLECTION).deleteMany({})

    // Seed organisations with numeric orgIds (as they exist in real environments)
    const { insertedIds } = await db
      .collection(ORGANISATIONS_COLLECTION)
      .insertMany([
        { orgId: TEST_ORG_NUMERIC_ID, version: 1 },
        { orgId: REAL_ORG_NUMERIC_ID, version: 1 }
      ])

    testOrgHexId = insertedIds[0].toHexString()
    realOrgHexId = insertedIds[1].toHexString()

    // Create PRNs via the real MongoDB repository
    // organisation.id stores the Mongo _id hex string (set by POST route from URL param)
    const repositoryFactory = await createPackagingRecyclingNotesRepository(db)
    const repository = repositoryFactory()

    await repository.create(
      buildAwaitingAcceptancePrn({
        organisation: { id: testOrgHexId, name: 'Test Reprocessor' }
      })
    )
    await repository.create(
      buildAwaitingAcceptancePrn({
        organisation: { id: realOrgHexId, name: 'Real Reprocessor' }
      })
    )

    // Create test server wired to the real MongoDB PRN repository
    server = await createTestServer({
      config: {
        packagingRecyclingNotesExternalApi: {
          clientId: externalApiClientId,
          jwksUrl: cognitoJwksUrl
        }
      },
      repositories: {
        packagingRecyclingNotesRepository: () => repository
      },
      featureFlags: createInMemoryFeatureFlags({
        packagingRecyclingNotesExternalApi: true
      })
    })

    // Resolve numeric org IDs to hex strings via real DB lookup
    // (mirrors what mongodb.plugin.js does at server startup)
    server.app.prnVisibilityFilter = await createPrnVisibilityFilter(db, {
      testOrganisationIds: [TEST_ORG_NUMERIC_ID]
    })
  })

  afterAll(async () => {
    await server?.stop()
  })

  it('excludes test organisation PRNs from the external list API', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/v1/packaging-recycling-notes?statuses=awaiting_acceptance',
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const payload = JSON.parse(response.payload)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].issuedByOrganisation.name).toBe('Real Reprocessor')
  })

  it('returns both PRNs when visibility filter resolves no organisations', async () => {
    // Reconfigure with an org ID that does not exist in the DB
    server.app.prnVisibilityFilter = await createPrnVisibilityFilter(db, {
      testOrganisationIds: [999999]
    })

    const response = await server.inject({
      method: 'GET',
      url: '/v1/packaging-recycling-notes?statuses=awaiting_acceptance',
      headers: authHeaders
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const payload = JSON.parse(response.payload)
    expect(payload.items).toHaveLength(2)
  })
})
