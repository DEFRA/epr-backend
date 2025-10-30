import { test as baseTest } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'

export const dbFixture = {
  // eslint-disable-next-line no-empty-pattern
  db: async ({}, use) => {
    await setupMongo({
      binary: {
        version: 'latest'
      },
      serverOptions: {},
      autoStart: false
    })

    const mongoUri = globalThis.__MONGO_URI__
    process.env.MONGO_URI = mongoUri

    await use(mongoUri)

    await teardownMongo()
  }
}

export const dbTest = baseTest.extend(dbFixture, { scope: 'file' })

export {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi
} from 'vitest'
