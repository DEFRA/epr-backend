import { describe, it, vi } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createServer } from '#root/server/server.js'
import {
  createIndexes,
  createOrUpdateCollections
} from '#root/common/helpers/collections/create-update.js'

/**
 * These tests are largely for coverage and can probably be deleted
 * once we have routes in place.
 */

vi.mock('#common/helpers/plugins/mongo-db-plugin.js', () => ({
  mongoDbPlugin: {
    plugin: {
      name: 'mongodb',
      version: '1.0.0',
      register: (server) => {
        const options = {
          listCollections: () => ({
            toArray: vi.fn().mockImplementation(() => {
              return server.featureFlags.dbExists === true
                ? [{ name: 'packaging-recycling-notes' }]
                : []
            })
          }),
          collection: () => options,
          createIndex: () => {},
          createCollection: () => {}
        }

        server.decorate('server', 'db', options)
        server.decorate('server', 'mongoClient', {})
        server.decorate('server', 'locker', {})

        createOrUpdateCollections(server.db, server.featureFlags)
        createIndexes(server.db, server.featureFlags)
      }
    }
  }
}))

describe('Packaging Recycling Notes', () => {
  setupAuthContext()

  it('enables when flag is true', async () => {
    const server = await createServer({
      featureFlags: {
        dbExists: true,
        isCreatePackagingRecyclingNotesEnabled: () => true
      }
    })

    expect(server.featureFlags.isCreatePackagingRecyclingNotesEnabled()).toBe(
      true
    )
  })

  it('enables when flag is true', async () => {
    const server = await createServer({
      featureFlags: {
        isCreatePackagingRecyclingNotesEnabled: () => true
      }
    })

    expect(server.featureFlags.isCreatePackagingRecyclingNotesEnabled()).toBe(
      true
    )
  })

  it('disables when flag is not true', async () => {
    const server = await createServer({
      featureFlags: {
        isCreatePackagingRecyclingNotesEnabled: () => false
      }
    })

    expect(server.featureFlags.isCreatePackagingRecyclingNotesEnabled()).toBe(
      false
    )
  })
})
