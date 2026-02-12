import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { createFormSubmissionsRepository } from './mongodb.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'
import {
  buildAccreditation,
  buildRegistration,
  buildOrganisation
} from './contract/test-data.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  formSubmissionsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createFormSubmissionsRepository(database)
    await use(factory)
  },

  seedAccreditations: async ({ mongoClient }, use) => {
    await use(async () => {
      const acc1 = buildAccreditation()
      const acc2 = buildAccreditation()
      const acc3 = buildAccreditation()
      const testData = [acc1, acc2, acc3]

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
    await use(async () => {
      const reg1 = buildRegistration()
      const reg2 = buildRegistration()
      const reg3 = buildRegistration()
      const testData = [reg1, reg2, reg3]

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
    await use(async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()
      const testData = [org1, org2, org3]

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

describe('MongoDB form submissions repository', () => {
  beforeEach(async ({ mongoClient }) => {
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
  })

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
      await createFormSubmissionsRepository(db)

      const counter = await db.collection('counters').findOne({ _id: 'orgId' })
      expect(counter.seq).toBe(500000)
    })

    it('initialises counter to highest existing orgId from form-submissions', async ({
      mongoClient,
      seedOrganisations
    }) => {
      const orgs = await seedOrganisations()
      const maxOrgId = Math.max(...orgs.map((o) => o.orgId))
      const db = mongoClient.db(DATABASE_NAME)
      await createFormSubmissionsRepository(db)

      const counter = await db.collection('counters').findOne({ _id: 'orgId' })
      expect(counter.seq).toBe(maxOrgId)
    })

    it('initialises counter to highest orgId from epr-organisations when higher', async ({
      mongoClient
    }) => {
      const db = mongoClient.db(DATABASE_NAME)
      const eprOrgId = 500999
      await db.collection('epr-organisations').insertOne({ orgId: eprOrgId })

      await createFormSubmissionsRepository(db)

      const counter = await db.collection('counters').findOne({ _id: 'orgId' })
      expect(counter.seq).toBe(eprOrgId)

      await db.collection('epr-organisations').deleteMany({})
    })

    it('does not overwrite counter on subsequent calls', async ({
      mongoClient
    }) => {
      const db = mongoClient.db(DATABASE_NAME)
      await createFormSubmissionsRepository(db)

      await db
        .collection('counters')
        .updateOne({ _id: 'orgId' }, { $set: { seq: 600000 } })

      await createFormSubmissionsRepository(db)

      const counter = await db.collection('counters').findOne({ _id: 'orgId' })
      expect(counter.seq).toBe(600000)
    })
  })

  testFormSubmissionsRepositoryContract(it)
})
