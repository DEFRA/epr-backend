import { describe, beforeEach, afterEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { StatusCodes } from 'http-status-codes'

import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { createPackagingRecyclingNotesRepository } from './mongodb.js'
import { buildAwaitingAcceptancePrn } from './contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import {
  cognitoJwksUrl,
  setupAuthContext
} from '#vite/helpers/setup-auth-mocking.js'
import { generateExternalApiToken } from '#packaging-recycling-notes/routes/test-helpers.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

const DATABASE_NAME = 'epr-backend'
const PRNS_COLLECTION = 'packaging-recycling-notes'
const TEST_ORGANISATION_NUMBER = toOrganisationNumber('500001')
const REAL_ORGANISATION_NUMBER = toOrganisationNumber('500002')

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

describe('Test organisation exclusion - integration with real MongoDB', () => {
  setupAuthContext()

  let db
  let server

  const externalApiClientId = randomUUID()
  const authHeaders = {
    authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
  }

  beforeEach(
    async (/** @type {{ mongoClient: MongoClient }} */ { mongoClient }) => {
      db = mongoClient.db(DATABASE_NAME)
      await db.collection(PRNS_COLLECTION).deleteMany({})
    }
  )

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  /** @param {OrganisationNumber[]} excludeOrganisationNumbers */
  async function createServerWithExclusion(excludeOrganisationNumbers) {
    const repositoryFactory = await createPackagingRecyclingNotesRepository(
      db,
      excludeOrganisationNumbers
    )
    const repository = repositoryFactory(createMockLogger())

    await repository.create(
      buildAwaitingAcceptancePrn({
        organisation: {
          id: new ObjectId().toHexString(),
          name: 'Test Reprocessor',
          organisationNumber: TEST_ORGANISATION_NUMBER
        }
      })
    )
    await repository.create(
      buildAwaitingAcceptancePrn({
        organisation: {
          id: new ObjectId().toHexString(),
          name: 'Real Reprocessor',
          organisationNumber: REAL_ORGANISATION_NUMBER
        }
      })
    )

    return createTestServer({
      config: {
        packagingRecyclingNotesExternalApi: {
          clientId: externalApiClientId,
          jwksUrl: cognitoJwksUrl
        }
      },
      repositories: {
        packagingRecyclingNotesRepository: () => repository
      }
    })
  }

  it('excludes test organisation PRNs from the external list API', async () => {
    server = await createServerWithExclusion([TEST_ORGANISATION_NUMBER])

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

  it('returns both PRNs when neither organisation number is excluded', async () => {
    server = await createServerWithExclusion([toOrganisationNumber('999999')])

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
