import Hapi from '@hapi/hapi'
import { describe, expect, it } from 'vitest'

import { portAdapter } from './port-adapter.js'

/** @import { ServerApp } from '#common/hapi-types.js' */

const overseasSites = { name: 'overseas sites' }

const overseasSitesAdapter = portAdapter({
  provides: 'overseasSitesRepository',
  needs: [],
  build: () => () =>
    /** @type {ServerApp['overseasSitesRepository']} */ (
      /** @type {unknown} */ (overseasSites)
    )
})

const readModelAdapter = portAdapter({
  provides: 'organisationReadRepository',
  needs: ['overseasSitesRepository'],
  /** @param {{ label: string }} options */
  build:
    ({ label }, { overseasSitesRepository }) =>
    () =>
      /** @type {ServerApp['organisationReadRepository']} */ (
        /** @type {unknown} */ ({ label, overseasSitesRepository })
      )
})

describe('portAdapter', () => {
  it('builds the port at start from its options and what it needs, in whatever order they register', async () => {
    const server = Hapi.server()
    await server.register({
      plugin: readModelAdapter,
      options: { label: 'read model' }
    })
    await server.register(overseasSitesAdapter)

    await server.initialize()

    expect(
      /** @type {ServerApp} */ (server.app).organisationReadRepository
    ).toEqual({ label: 'read model', overseasSitesRepository: overseasSites })
  })

  it('refuses to start without a provider it needs', async () => {
    const server = Hapi.server()
    await server.register({
      plugin: readModelAdapter,
      options: { label: 'read model' }
    })

    await expect(server.initialize()).rejects.toThrow(/overseasSitesRepository/)
  })

  it('refuses a second adapter for the same port', async () => {
    const server = Hapi.server()
    await server.register(overseasSitesAdapter)

    await expect(server.register(overseasSitesAdapter)).rejects.toThrow(
      /already registered/
    )
  })
})
