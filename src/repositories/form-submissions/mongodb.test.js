import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { createFormSubmissionsRepository } from './mongodb.js'
import { testFindBehaviour } from './contract/find.contract.js'
import { buildAccreditation, buildRegistration } from './contract/test-data.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  formSubmissionsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = createFormSubmissionsRepository(database)
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
  })

  it('should create repository instance', async ({
    formSubmissionsRepository
  }) => {
    const repository = formSubmissionsRepository()
    expect(repository).toBeDefined()
    expect(repository.findAllRegistrations).toBeDefined()
    expect(repository.findAllAccreditations).toBeDefined()
  })

  testFindBehaviour(it)
})
