import { describe, it, vi } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createServer } from '#root/server/server.js'
import {
  createFormCollections,
  createLockManagerIndex
} from '#root/common/helpers/collections/create-update.js'

/**
 * Tests for Lumpy Packaging Recycling Notes feature flag.
 *
 * The lumpy PRN implementation is COMPLETELY SEPARATE from the engineering team's:
 * - Different feature flag: isCreateLumpyPackagingRecyclingNotesEnabled
 * - Different repository: lumpyPackagingRecyclingNotesRepository
 * - Different routes: /l-packaging-recycling-notes
 *
 * No code is shared between the two implementations.
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
                ? [{ name: 'l-packaging-recycling-notes' }]
                : []
            })
          }),
          collection: () => options,
          createIndex: () => {},
          createCollection: () => {},
          indexes: async () => []
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
      featureFlags: {
        dbExists: true,
        isCreateLumpyPackagingRecyclingNotesEnabled: () => true
      }
    })

    expect(
      server.featureFlags.isCreateLumpyPackagingRecyclingNotesEnabled()
    ).toBe(true)
  })

  it('enables when flag is true & collection does not yet exist', async () => {
    const server = await createServer({
      featureFlags: {
        isCreateLumpyPackagingRecyclingNotesEnabled: () => true
      }
    })

    expect(
      server.featureFlags.isCreateLumpyPackagingRecyclingNotesEnabled()
    ).toBe(true)
  })

  it('disables when flag is not true', async () => {
    const server = await createServer({
      featureFlags: {
        isCreateLumpyPackagingRecyclingNotesEnabled: () => false
      }
    })

    expect(
      server.featureFlags.isCreateLumpyPackagingRecyclingNotesEnabled()
    ).toBe(false)
  })
})
