import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it as base } from 'vitest'
import { COLLECTION_NAME } from '#repositories/organisations/mongodb-find.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import {
  createOrganisationBuilders,
  prepareOrgUpdate
} from '#repositories/organisations/contract/test-data.js'
import { toStoredOrganisation } from '#repositories/organisations/helpers.js'
import { createMockDb } from '#test/mock-db.js'
import { createMongoError } from '#test/mongo-error.js'
import { createRegistrationAccreditationAdminRepository } from './mongodb.js'
import { testRegistrationAccreditationAdminRepositoryContract } from './port.contract.js'

/**
 * @import { OrganisationsRepositoryFactory } from '#repositories/organisations/port.js'
 * @typedef {{ mongoClient: MongoClient, organisationsRepository: OrganisationsRepositoryFactory }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'

const { buildOrganisation } = createOrganisationBuilders()

const it = /** @type {import('vitest').TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    organisationsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const organisations = await createOrganisationsRepository(database)
      const admin = createRegistrationAccreditationAdminRepository(database)
      await use(() => ({ ...organisations(), ...admin() }))
    }
  })
)

describe('MongoDB registration and accreditation admin repository', () => {
  beforeEach(
    /** @param {MongoFixtures} fixture */ async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .deleteMany({})
    }
  )

  testRegistrationAccreditationAdminRepositoryContract(it)
})

describe('MongoDB registration and accreditation admin repository errors', () => {
  base(
    'converts E11000 from replace to a curated Boom.conflict without leaking the raw errmsg',
    async () => {
      const existingOrg = buildOrganisation()
      const existingDoc = {
        ...toStoredOrganisation(existingOrg),
        _id: ObjectId.createFromHexString(existingOrg.id),
        version: 1,
        schemaVersion: 1,
        users: []
      }
      const leakyErrmsg =
        'E11000 duplicate key error collection: epr-backend.epr-organisations index: orgId_1 dup key: { orgId: "conflicting-value" }'
      const dbMock = createMockDb({
        findOne: async () => existingDoc,
        replaceOne: async () => {
          throw createMongoError(leakyErrmsg, {
            code: 11000,
            keyPattern: { orgId: 1 }
          })
        }
      })

      const repository =
        createRegistrationAccreditationAdminRepository(dbMock)()
      const updatePayload = prepareOrgUpdate(existingOrg, {
        wasteProcessingTypes: ['reprocessor']
      })

      await expect(
        repository.replace(existingOrg.id, 1, updatePayload)
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 409,
          payload: {
            message: expect.stringContaining('orgId')
          }
        },
        event: {
          action: 'update_organisation',
          reason: 'fields=orgId type=Error code=11000'
        }
      })

      await expect(
        repository.replace(existingOrg.id, 1, updatePayload)
      ).rejects.not.toMatchObject({
        message: expect.stringContaining('conflicting-value')
      })
    }
  )

  base(
    'falls back to "unknown" in the dup-key message from replace when keyPattern is absent',
    async () => {
      const existingOrg = buildOrganisation()
      const existingDoc = {
        ...toStoredOrganisation(existingOrg),
        _id: ObjectId.createFromHexString(existingOrg.id),
        version: 1,
        schemaVersion: 1,
        users: []
      }
      const dbMock = createMockDb({
        findOne: async () => existingDoc,
        replaceOne: async () => {
          throw createMongoError('E11000 duplicate key error', { code: 11000 })
        }
      })

      const repository =
        createRegistrationAccreditationAdminRepository(dbMock)()
      const updatePayload = prepareOrgUpdate(existingOrg, {
        wasteProcessingTypes: ['reprocessor']
      })

      await expect(
        repository.replace(existingOrg.id, 1, updatePayload)
      ).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 409,
          payload: {
            message: expect.stringContaining('unknown')
          }
        }
      })
    }
  )
})
