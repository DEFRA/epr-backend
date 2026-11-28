import Hapi from '@hapi/hapi'

import { STRATEGY_NAME as UPLOAD_CALLBACK } from '#plugins/auth/upload-callback-auth-plugin.js'
import { overseasSitesRoutesPlugin } from './plugin.js'

describe('overseasSitesRoutesPlugin', () => {
  const providers = overseasSitesRoutesPlugin.dependencies

  const stubPlugin = (/** @type {string} */ name) => ({
    name,
    register: () => {}
  })

  /** @param {string[]} registered */
  const serverWith = async (registered) => {
    const server = Hapi.server()
    server.auth.scheme('stub', () => ({
      authenticate: (_request, h) => h.unauthenticated(new Error('stub'))
    }))
    server.auth.strategy('default', 'stub')
    server.auth.strategy(UPLOAD_CALLBACK, 'stub')
    server.auth.default('default')
    await server.register(registered.map(stubPlugin))
    await server.register(
      /** @type {any} */ ({
        plugin: overseasSitesRoutesPlugin,
        options: { orsBucket: 'ors-bucket', regAccredApi: {} }
      })
    )
    return server
  }

  it.each(providers)('refuses to initialise without %s', async (missing) => {
    const server = await serverWith(
      providers.filter((name) => name !== missing)
    )

    await expect(server.initialize()).rejects.toThrow(missing)
  })
})
