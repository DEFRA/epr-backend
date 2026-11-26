import Hapi from '@hapi/hapi'
import { describe, expect, it } from 'vitest'

import { systemLogsRoutesPlugin } from './plugin.js'

const serverWithDefaultAuth = () => {
  const server = Hapi.server()
  server.auth.scheme('anyone', () => ({
    authenticate: (_request, h) => h.authenticated({ credentials: {} })
  }))
  server.auth.strategy('anyone', 'anyone')
  server.auth.default('anyone')
  return server
}

describe('the system logs routes plugin', () => {
  it('refuses to start without a system logs repository', async () => {
    const server = serverWithDefaultAuth()
    await server.register(
      /** @type {import('@hapi/hapi').Plugin<void>} */ (
        /** @type {unknown} */ (systemLogsRoutesPlugin)
      )
    )

    await expect(server.initialize()).rejects.toThrow(/systemLogsRepository/)
  })
})
