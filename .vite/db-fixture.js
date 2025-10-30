import { test as baseTest } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { startS3Server, stopS3Server } from './s3-memory-server.js'

/**
 * MongoDB fixture - provides database connection.
 * Use this for tests that need MongoDB.
 */
const dbFixture = {
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

/**
 * S3 fixture - provides S3 mock server.
 * Use this for tests that need S3.
 */
const s3Fixture = {
  // eslint-disable-next-line no-empty-pattern
  s3: async ({}, use) => {
    await startS3Server()

    const s3Endpoint = globalThis.__S3_ENDPOINT__
    process.env.S3_ENDPOINT = s3Endpoint

    await use(s3Endpoint)

    await stopS3Server()
  }
}

/**
 * Test with MongoDB support.
 * Import this for repository tests or tests that need database access.
 */
export const dbTest = baseTest.extend(dbFixture, { scope: 'file' })

/**
 * Test with MongoDB Db instance.
 * Import this for repository tests that need direct database access.
 * Provides a Db instance without spinning up the full Hapi server.
 */
export const dbInstanceTest = dbTest.extend(
  {
    dbInstance: async ({ db }, use) => {
      // eslint-disable-next-line no-unused-vars
      const _mongoUri = db
      const { MongoClient } = await import('mongodb')
      const client = new MongoClient(process.env.MONGO_URI)
      await client.connect()
      const database = client.db('epr-backend')

      await use(database)

      await client.close()
    }
  },
  { scope: 'file' }
)

/**
 * Test with S3 support.
 * Import this for tests that upload/download files to S3.
 */
export const s3Test = baseTest.extend(s3Fixture, { scope: 'file' })

/**
 * Test with both MongoDB and S3 support.
 * Import this for end-to-end tests that need both services.
 */
export const integrationTest = baseTest.extend(
  {
    ...dbFixture,
    ...s3Fixture
  },
  { scope: 'file' }
)

/**
 * Server fixture that provides a Hapi server with MongoDB already configured.
 * Use this for integration tests that need a full server instance.
 */
export const serverTest = dbTest.extend(
  {
    server: async ({ db }, use) => {
      // db parameter triggers MongoDB setup (unused directly)
      // eslint-disable-next-line no-unused-vars
      const _dbUri = db
      const { createServer } = await import('#server/server.js')
      const server = await createServer()
      await server.initialize()

      await use(server)

      await server.stop()
    }
  },
  { scope: 'file' }
)

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
