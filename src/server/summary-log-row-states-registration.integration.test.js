import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { randomUUID } from 'node:crypto'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'

vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

const startMongo = async () => {
  await setupMongo(
    /** @type {*} */ ({
      binary: { version: 'latest' },
      serverOptions: {},
      autoStart: false
    })
  )
  process.env.MONGO_URI = globalThis.__MONGO_URI__
}

const bootServer = async () => {
  process.env.MONGO_DATABASE = `epr-backend-test-${randomUUID()}`
  const { createServer } = await import('#server/server.js')
  const server = await createServer()
  await server.initialize()
  // The mongoDb plugin decorates `db` and repository plugins decorate `app`;
  // neither is on Hapi's Server type, so project to the test's dynamic shape.
  return /** @type {*} */ (server)
}

describe('summary-log-row-states repository registration', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    await startMongo()
    server = await bootServer()
  })

  afterAll(async () => {
    await server.db.dropDatabase()
    await server.stop()
    await teardownMongo()
  })

  it('constructs the row-state repository', () => {
    expect(server.app.summaryLogRowStatesRepository).toBeDefined()
  })

  it('creates the empty collection with its three indexes', async () => {
    const indexes = await server.db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .listIndexes()
      .toArray()

    const indexesByName = Object.fromEntries(
      indexes.map((index) => [index.name, index])
    )

    expect(indexesByName).toHaveProperty('summary_log_membership')
    expect(indexesByName).toHaveProperty('row_history')
    expect(indexesByName.summary_log_row_state_identity.unique).toBe(true)

    const documentCount = await server.db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .countDocuments()

    expect(documentCount).toBe(0)
  })
})
