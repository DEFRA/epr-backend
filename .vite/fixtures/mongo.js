import { test as baseTest } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'

const dbFixture = {
  db: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
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
    },
    { scope: 'file' }
  ]
}

export const it = baseTest.extend(dbFixture)
