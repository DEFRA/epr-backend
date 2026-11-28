import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { randomUUID } from 'node:crypto'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

describe('packaging recycling notes registration', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    await setupMongo({ serverOptions: {} })
    process.env.MONGO_URI = globalThis.__MONGO_URI__
    process.env.MONGO_DATABASE = `epr-backend-test-${randomUUID()}`
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.db.dropDatabase()
    await server.stop()
    await teardownMongo()
  })

  it('registers the PRN repository', () => {
    expect(server.app.packagingRecyclingNotesRepository).toBeDefined()
  })

  it('registers the PRN routes', () => {
    expect(
      server.registrations['packaging-recycling-notes-routes']
    ).toBeDefined()
  })

  it('registers the startup sweep of stale PRN projections', () => {
    expect(
      server.registrations['reconcile-stale-prn-projections']
    ).toBeDefined()
  })
})
