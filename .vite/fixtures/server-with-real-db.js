import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { serverOnRealDb } from '#vite/fixtures/real-db-server.js'
import { createAppTestServer } from '#test/create-app-test-server.js'

/** @import { TestAPI } from 'vitest' */

/** @typedef {import('#vite/fixtures/real-db-server.js').TestServerWithRealDb} TestServerWithRealDb */

/** The whole app on one in-memory Mongo, as `serverOnRealDb` describes. */
export const it = /** @type {TestAPI<{ server: TestServerWithRealDb }>} */ (
  mongoIt.extend({ server: serverOnRealDb(createAppTestServer) })
)
