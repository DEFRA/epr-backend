import { test } from 'vitest'
import { dbTest } from './mongo.js'

export const serverTest = test.extend(
  {
    // eslint-disable-next-line no-empty-pattern
    server: async ({}, use) => {
      const { createServer } = await import('#server/server.js')
      const server = await createServer({ skipMongoDb: true })
      await server.initialize()

      await use(server)

      await server.stop()
    }
  },
  { scope: 'file' }
)

export const serverWithDbTest = dbTest.extend(
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
