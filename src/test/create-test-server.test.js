import { describe, it, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from './create-test-server.js'
import { registerDependency } from '#plugins/register-dependency.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

/** @import { DependencyPlugin } from './create-test-server.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { Server } from '@hapi/hapi' */
/** @import { HapiServer } from '#common/hapi-types.js' */

/**
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @returns {DependencyPlugin}
 */
const ledgerPlugin = (ledgerRepository) => ({
  name: 'ledgerRepository',
  register: (/** @type {Server & HapiServer} */ server) => {
    registerDependency(server, 'ledgerRepository', () => ledgerRepository)
  }
})

describe('createTestServer', () => {
  setupAuthContext()

  it('serves no routes unless the test gives it some', async () => {
    const server = await createTestServer()

    const response = await server.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('builds the routes it serves from the config', async () => {
    const server = await createTestServer({
      config: { featureFlags: { devEndpoints: true } },
      routes: (config) => [
        {
          method: 'GET',
          path: '/dev-endpoints',
          options: { auth: false },
          handler: () => ({ enabled: config.get('featureFlags.devEndpoints') })
        }
      ]
    })

    const response = await server.inject({
      method: 'GET',
      url: '/dev-endpoints'
    })

    expect(JSON.parse(response.payload)).toEqual({ enabled: true })
  })

  it('registers an override in the place of the plugin of its name', async () => {
    const override = createInMemoryLedgerRepository()()
    /** @type {unknown} */
    let ledgerSeenAtRegistration

    await createTestServer({
      plugins: [
        ledgerPlugin(createInMemoryLedgerRepository()()),
        {
          name: 'ledgerReader',
          register: (/** @type {Server & HapiServer} */ server) => {
            ledgerSeenAtRegistration = server.app.ledgerRepository
          }
        }
      ],
      repositories: { ledgerRepository: override }
    })

    expect(ledgerSeenAtRegistration).toBe(override)
  })

  it('registers an override that has no plugin of its name', async () => {
    const override = createInMemoryLedgerRepository()()

    const server = await createTestServer({
      repositories: { ledgerRepository: override }
    })

    expect(server.app.ledgerRepository).toBe(override)
  })
})
