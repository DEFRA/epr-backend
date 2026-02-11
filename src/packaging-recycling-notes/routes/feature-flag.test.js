import { describe, it, vi } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createServer } from '#root/server/server.js'
import {
  createFormCollections,
  createLockManagerIndex
} from '#root/common/helpers/collections/create-update.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { packagingRecyclingNotesAcceptPath } from '#packaging-recycling-notes/routes/accept.js'
import { packagingRecyclingNotesListPath } from '#packaging-recycling-notes/routes/list.js'
import { packagingRecyclingNotesRejectPath } from '#packaging-recycling-notes/routes/reject.js'

/**
 * Tests for Packaging Recycling Notes feature flag.
 *
 * The PRN implementation is COMPLETELY SEPARATE from the engineering team's:
 * - Different feature flag: isCreatePackagingRecyclingNotesEnabled
 * - Different repository: packagingRecyclingNotesRepository
 * - Different routes: /packaging-recycling-notes
 *
 * No code is shared between the two implementations.
 *
 * External API endpoints (e.g. accept) are gated behind a separate flag:
 * isPackagingRecyclingNotesExternalApiEnabled
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
        isCreatePackagingRecyclingNotesEnabled: () => true
      }
    })

    expect(server.featureFlags.isCreatePackagingRecyclingNotesEnabled()).toBe(
      true
    )
  })

  it('enables when flag is true & collection does not yet exist', async () => {
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

  describe('external API flag', () => {
    const hasRoute = (server, path) =>
      server.table().some((route) => route.path === path)

    it('registers accept route when external API flag is enabled', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotesExternalApi: true
        })
      })

      expect(hasRoute(server, packagingRecyclingNotesAcceptPath)).toBe(true)

      await server.stop()
    })

    it('does not register accept route when external API flag is disabled', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotes: true,
          packagingRecyclingNotesExternalApi: false
        })
      })

      expect(hasRoute(server, packagingRecyclingNotesAcceptPath)).toBe(false)

      await server.stop()
    })

    it('registers reject route when external API flag is enabled', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotesExternalApi: true
        })
      })

      expect(hasRoute(server, packagingRecyclingNotesRejectPath)).toBe(true)

      await server.stop()
    })

    it('does not register reject route when external API flag is disabled', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotes: true,
          packagingRecyclingNotesExternalApi: false
        })
      })

      expect(hasRoute(server, packagingRecyclingNotesRejectPath)).toBe(false)

      await server.stop()
    })

    it('registers list route when external API flag is enabled', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotesExternalApi: true
        })
      })

      expect(hasRoute(server, packagingRecyclingNotesListPath)).toBe(true)

      await server.stop()
    })

    it('does not register list route when external API flag is disabled', async () => {
      const server = await createTestServer({
        featureFlags: createInMemoryFeatureFlags({
          packagingRecyclingNotes: true,
          packagingRecyclingNotesExternalApi: false
        })
      })

      expect(hasRoute(server, packagingRecyclingNotesListPath)).toBe(false)

      await server.stop()
    })
  })
})
