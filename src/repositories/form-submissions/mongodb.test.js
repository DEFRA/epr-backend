import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { createFormSubmissionsRepository } from './mongodb.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'
import {
  buildAccreditation,
  buildRegistration,
  buildOrganisation
} from './contract/test-data.js'

/**
 * @import { Collection, Db } from 'mongodb'
 * @import { TestAPI } from 'vitest'
 * @import { FormSubmissionsRepositoryFactory } from './port.js'
 *
 * @typedef {{
 *   mongoClient: MongoClient
 *   formSubmissionsRepository: FormSubmissionsRepositoryFactory
 *   seedAccreditations: (overrides?: Parameters<typeof buildAccreditation>[0][]) => Promise<ReturnType<typeof buildAccreditation>[]>
 *   seedRegistrations: (overrides?: Parameters<typeof buildRegistration>[0][]) => Promise<ReturnType<typeof buildRegistration>[]>
 *   seedOrganisations: (overrides?: Parameters<typeof buildOrganisation>[0][]) => Promise<ReturnType<typeof buildOrganisation>[]>
 * }} MongoFixtures
 */

const DATABASE_NAME = 'epr-backend'
const testLogger = { info: vi.fn() }

/**
 * The counters collection is keyed by a string `_id` (e.g. 'orgId'), not the
 * default `ObjectId`.
 *
 * @param {Db} db
 * @returns {Collection<{ _id: string, seq: number }>}
 */
const countersCollection = (db) =>
  /** @type {Collection<{ _id: string, seq: number }>} */ (
    db.collection('counters')
  )

const it = /** @type {TestAPI<MongoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    formSubmissionsRepository: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createFormSubmissionsRepository(
        database,
        testLogger
      )
      await use(factory)
    },

    seedAccreditations: async ({ mongoClient }, use) => {
      await use(async (overrides) => {
        const testData = overrides
          ? overrides.map((override) => buildAccreditation(override))
          : [buildAccreditation(), buildAccreditation(), buildAccreditation()]

        await mongoClient
          .db(DATABASE_NAME)
          .collection('accreditation')
          .insertMany(
            testData.map((acc) => ({
              _id: ObjectId.createFromHexString(acc.id),
              ...acc
            }))
          )

        return testData
      })
    },

    seedRegistrations: async ({ mongoClient }, use) => {
      await use(async (overrides) => {
        const testData = overrides
          ? overrides.map((override) => buildRegistration(override))
          : [buildRegistration(), buildRegistration(), buildRegistration()]

        await mongoClient
          .db(DATABASE_NAME)
          .collection('registration')
          .insertMany(
            testData.map((reg) => ({
              _id: ObjectId.createFromHexString(reg.id),
              ...reg
            }))
          )

        return testData
      })
    },

    seedOrganisations: async ({ mongoClient }, use) => {
      await use(async (overrides) => {
        const testData = overrides
          ? overrides.map((override) => buildOrganisation(override))
          : [buildOrganisation(), buildOrganisation(), buildOrganisation()]

        await mongoClient
          .db(DATABASE_NAME)
          .collection('organisation')
          .insertMany(
            testData.map((org) => ({
              _id: ObjectId.createFromHexString(org.id),
              ...org
            }))
          )

        return testData
      })
    }
  })
)

describe('MongoDB form submissions repository', () => {
  beforeEach(
    /** @param {MongoFixtures} fixture */ async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection('accreditation')
        .deleteMany({})
      await mongoClient
        .db(DATABASE_NAME)
        .collection('registration')
        .deleteMany({})
      await mongoClient
        .db(DATABASE_NAME)
        .collection('organisation')
        .deleteMany({})
      await mongoClient.db(DATABASE_NAME).collection('counters').deleteMany({})
    }
  )

  it('should create repository instance', async ({
    formSubmissionsRepository
  }) => {
    const repository = formSubmissionsRepository()
    expect(repository).toBeDefined()
    expect(repository.findAllRegistrations).toBeDefined()
    expect(repository.findRegistrationsBySystemReference).toBeDefined()
    expect(repository.findRegistrationById).toBeDefined()
    expect(repository.findAllAccreditations).toBeDefined()
    expect(repository.findAccreditationsBySystemReference).toBeDefined()
    expect(repository.findAccreditationById).toBeDefined()
    expect(repository.findAllOrganisations).toBeDefined()
    expect(repository.findOrganisationById).toBeDefined()
  })

  describe('orgId counter seeding', () => {
    it('initialises counter to ORG_ID_START_NUMBER when no organisations exist', async ({
      mongoClient
    }) => {
      const db = mongoClient.db(DATABASE_NAME)
      await createFormSubmissionsRepository(db, testLogger)

      const counter = await countersCollection(db).findOne({ _id: 'orgId' })
      expect(counter?.seq).toBe(500000)
    })

    it('initialises counter to highest existing orgId from form-submissions', async ({
      mongoClient,
      seedOrganisations
    }) => {
      const orgs = await seedOrganisations()
      const maxOrgId = Math.max(...orgs.map((o) => o.orgId))
      const db = mongoClient.db(DATABASE_NAME)
      await createFormSubmissionsRepository(db, testLogger)

      const counter = await countersCollection(db).findOne({ _id: 'orgId' })
      expect(counter?.seq).toBe(maxOrgId)
    })

    it('initialises counter to highest orgId from epr-organisations when higher', async ({
      mongoClient
    }) => {
      const db = mongoClient.db(DATABASE_NAME)
      const eprOrgId = 500999
      await db.collection('epr-organisations').insertOne({ orgId: eprOrgId })

      await createFormSubmissionsRepository(db, testLogger)

      const counter = await countersCollection(db).findOne({ _id: 'orgId' })
      expect(counter?.seq).toBe(eprOrgId)

      await db.collection('epr-organisations').deleteMany({})
    })

    it('does not overwrite counter on subsequent calls', async ({
      mongoClient
    }) => {
      const db = mongoClient.db(DATABASE_NAME)
      await createFormSubmissionsRepository(db, testLogger)

      await countersCollection(db).updateOne(
        { _id: 'orgId' },
        { $set: { seq: 600000 } }
      )

      await createFormSubmissionsRepository(db, testLogger)

      const counter = await countersCollection(db).findOne({ _id: 'orgId' })
      expect(counter?.seq).toBe(600000)
    })
  })

  testFormSubmissionsRepositoryContract(it)
})
