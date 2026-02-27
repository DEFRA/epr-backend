import { describe, it, expect } from 'vitest'

import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { overseasSitesCreatePath } from './post.js'
import { overseasSiteByIdPath } from './get-by-id.js'
import { overseasSitesListPath } from './list.js'

const hasRoute = (server, method, path) =>
  server.table().some((route) => route.method === method && route.path === path)

describe('Overseas Sites feature flag', () => {
  setupAuthContext()

  it('registers all overseas sites routes when flag is enabled', async () => {
    const server = await createTestServer({
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: true
      })
    })

    expect(hasRoute(server, 'post', overseasSitesCreatePath)).toBe(true)
    expect(hasRoute(server, 'get', overseasSiteByIdPath)).toBe(true)
    expect(hasRoute(server, 'get', overseasSitesListPath)).toBe(true)
    expect(hasRoute(server, 'put', overseasSiteByIdPath)).toBe(true)
    expect(hasRoute(server, 'delete', overseasSiteByIdPath)).toBe(true)

    await server.stop()
  })

  it('does not register overseas sites routes when flag is disabled', async () => {
    const server = await createTestServer({
      featureFlags: createInMemoryFeatureFlags({
        overseasSites: false
      })
    })

    expect(hasRoute(server, 'post', overseasSitesCreatePath)).toBe(false)
    expect(hasRoute(server, 'get', overseasSiteByIdPath)).toBe(false)
    expect(hasRoute(server, 'get', overseasSitesListPath)).toBe(false)
    expect(hasRoute(server, 'put', overseasSiteByIdPath)).toBe(false)
    expect(hasRoute(server, 'delete', overseasSiteByIdPath)).toBe(false)

    await server.stop()
  })
})
