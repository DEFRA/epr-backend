import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { randomUUID } from 'node:crypto'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { unexportedTonnageDependencies } from './run-unexported-tonnage-report.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 */

vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

const startMongo = async () => {
  await setupMongo()
  process.env.MONGO_URI = globalThis.__MONGO_URI__
}

const bootServer = async () => {
  process.env.MONGO_DATABASE = `epr-backend-test-${randomUUID()}`
  const { createServer } = await import('#server/server.js')
  const server = await createServer()
  await server.initialize()

  return /** @type {StartedServer} */ (server)
}

describe('unexported tonnage diagnostic wiring', () => {
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

  it('resolves every repository it reads against a real booted server', () => {
    const unresolved = Object.entries(unexportedTonnageDependencies(server))
      .filter(([, repository]) => repository === undefined)
      .map(([name]) => name)

    expect(unresolved).toStrictEqual([])
  })
})
