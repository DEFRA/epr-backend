import Hapi from '@hapi/hapi'
import { Collection, MongoClient } from 'mongodb'
import { afterEach, describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { getConfig } from '#root/config.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepositoryPlugin } from '#repositories/organisations/inmemory.plugin.js'
import { readAccreditationsOverHttpPlugin } from './read-over-http.plugin.js'

/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { ServerApp } from '#common/hapi-types.js' */

/** @type {import('vitest').TestAPI<{ mongoClient: MongoClient }>} */
const it = /** @type {any} */ (mongoIt).extend({
  mongoClient: async (
    /** @type {{ db: string }} */ { db },
    /** @type {(client: MongoClient) => Promise<void>} */ use
  ) => {
    // Reads from a secondary by default, as the service does
    const client = await MongoClient.connect(db, {
      readPreference: 'secondaryPreferred'
    })
    await use(client)
    await client.close()
  }
})

/**
 * Stands in for the mongoDb plugin: decorates the server with the client and
 * database, as the plugin under test expects.
 *
 * @param {MongoClient} mongoClient
 */
const mongoDbPlugin = (mongoClient) => ({
  name: 'mongodb',
  /** @param {import('@hapi/hapi').Server} server */
  register: (server) => {
    server.decorate('server', 'mongoClient', mongoClient)
    server.decorate('server', 'db', mongoClient.db('epr-backend'))
  }
})

/** @param {MongoClient} mongoClient */
const startServer = async (mongoClient) => {
  const server = Hapi.server()
  await server.register([
    mongoDbPlugin(mongoClient),
    createInMemoryOrganisationsRepositoryPlugin([])
  ])
  await server.register({
    plugin: /** @type {import('@hapi/hapi').Plugin<any>} */ (
      /** @type {unknown} */ (readAccreditationsOverHttpPlugin)
    ),
    options: { config: getConfig() }
  })
  return server
}

describe('readAccreditationsOverHttpPlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decorates request with localOrganisationsRepository that reads from primary', async ({
    mongoClient
  }) => {
    const server = await startServer(mongoClient)
    const organisation = buildOrganisation()
    await /** @type {ServerApp} */ (
      server.app
    ).localOrganisationsRepository.insert(organisation)

    /** @type {string[]} */
    const readPreferences = []
    const findOne = Collection.prototype.findOne
    vi.spyOn(Collection.prototype, 'findOne').mockImplementation(
      /** @this {Collection} */
      function (...args) {
        readPreferences.push(this.readPreference?.mode ?? 'unset')
        return /** @type {any} */ (findOne).apply(this, args)
      }
    )

    server.route({
      method: 'GET',
      path: '/test/local-read',
      handler: async (request) => {
        const { localOrganisationsRepository } =
          /** @type {{ localOrganisationsRepository: OrganisationsRepository }} */ (
            /** @type {unknown} */ (request)
          )
        const found = await localOrganisationsRepository.findById(
          organisation.id
        )
        return { id: found.id }
      }
    })

    const response = await server.inject('/test/local-read')

    expect(JSON.parse(response.payload)).toStrictEqual({ id: organisation.id })
    expect(readPreferences).not.toHaveLength(0)
    expect(new Set(readPreferences)).toStrictEqual(new Set(['primary']))
  })

  it('swaps request.organisationsRepository for one reading over HTTP', async ({
    mongoClient
  }) => {
    const server = await startServer(mongoClient)
    const app = /** @type {ServerApp} */ (server.app)

    expect(app.organisationsRepository).not.toBe(
      app.localOrganisationsRepository
    )
  })
})
