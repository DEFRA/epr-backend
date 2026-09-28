import Hapi from '@hapi/hapi'
import { describe, expect, it } from 'vitest'
import { getConfig } from '#root/config.js'
import { createInMemoryOrganisationsRepositoryPlugin } from '#repositories/organisations/inmemory.plugin.js'
import { readAccreditationsOverHttpPlugin } from './read-over-http.plugin.js'

/** @import { ServerApp } from '#common/hapi-types.js' */

describe('readAccreditationsOverHttpPlugin', () => {
  it('keeps the repository it replaces as the local one', async () => {
    const server = Hapi.server()
    await server.register(createInMemoryOrganisationsRepositoryPlugin([]))
    const app = /** @type {ServerApp} */ (server.app)
    const local = app.organisationsRepository

    await server.register({
      plugin: /** @type {import('@hapi/hapi').Plugin<any>} */ (
        /** @type {unknown} */ (readAccreditationsOverHttpPlugin)
      ),
      options: { config: getConfig() }
    })

    expect(app.localOrganisationsRepository).toBe(local)
    expect(app.organisationsRepository).not.toBe(local)
  })
})
