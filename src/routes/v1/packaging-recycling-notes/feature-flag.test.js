import { describe, it, vi } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createServer } from '#root/server/server.js'
import {
  createFormCollections,
  createLockManagerIndex
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

        createFormCollections(server.db)
        createLockManagerIndex(server.db)
      }
    }
  }
}))

describe('Packaging Recycling Notes', () => {
  setupAuthContext()

  it('enables when flag is true & collection exists', async () => {
    const server = await createServer({
      skipQueueConsumer: true,
      featureFlags: {
        dbExists: true,
        isCreatePackagingRecyclingNotesEnabled: () => true
      }
    })

    expect(server.featureFlags.isCreatePackagingRecyclingNotesEnabled()).toBe(
      true
    )
  })

  it('enables when flag is true & collection does not yet exist', async () => {
    const server = await createServer({
      skipQueueConsumer: true,
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
      skipQueueConsumer: true,
      featureFlags: {
        isCreatePackagingRecyclingNotesEnabled: () => false
      }
    })

    expect(server.featureFlags.isCreatePackagingRecyclingNotesEnabled()).toBe(
      false
    )
  })
})
