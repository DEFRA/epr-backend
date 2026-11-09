import { describe, beforeEach, afterEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'
import { StatusCodes } from 'http-status-codes'

import { createPrnVisibilityFilter } from './prn-visibility-filter.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import {
  cognitoJwksUrl,
  setupAuthContext
} from '#vite/helpers/setup-auth-mocking.js'
import { generateExternalApiToken } from '#packaging-recycling-notes/routes/test-helpers.js'

const DATABASE_NAME = 'epr-backend'
const ORGANISATIONS_COLLECTION = 'epr-organisations'
const PRNS_COLLECTION = 'packaging-recycling-notes'
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

const { buildOrganisation } = createOrganisationBuilders()

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
  /** @type {OrganisationsRepository} */
  let organisationsRepository
  /** @type {Omit<Organisation, 'status'>} */
  let testOrg
  /** @type {Omit<Organisation, 'status'>} */
  let realOrg

  const externalApiClientId = randomUUID()
  const authHeaders = {
    authorization: `Bearer ${generateExternalApiToken(externalApiClientId)}`
  }

  beforeEach(
    async (/** @type {{ mongoClient: MongoClient }} */ { mongoClient }) => {
      db = mongoClient.db(DATABASE_NAME)
      await db.collection(ORGANISATIONS_COLLECTION).deleteMany({})
      await db.collection(PRNS_COLLECTION).deleteMany({})

      organisationsRepository = (await createOrganisationsRepository(db))()
      testOrg = buildOrganisation()
      realOrg = buildOrganisation()
      await organisationsRepository.insert(testOrg)
      await organisationsRepository.insert(realOrg)
    }
  )

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  async function createServerWithExclusion(testOrganisationIds) {
    const { excludeOrganisationIds } = await createPrnVisibilityFilter(
      organisationsRepository,
      { testOrganisationIds }
    )
    const repositoryFactory = await createPackagingRecyclingNotesRepository(
      db,
      excludeOrganisationIds
    )
    const repository = repositoryFactory(createMockLogger())

    await repository.create(
      buildAwaitingAcceptancePrn({
        organisation: { id: testOrg.id, name: 'Test Reprocessor' }
      })
    )
    await repository.create(
      buildAwaitingAcceptancePrn({
        organisation: { id: realOrg.id, name: 'Real Reprocessor' }
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
    server = await createServerWithExclusion([testOrg.orgId])

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
    server = await createServerWithExclusion([999999])

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
