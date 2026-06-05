import { getConfig } from '#root/config.js'
import Hapi from '@hapi/hapi'
import hapiPino from 'hapi-pino'
import { describe, expect, it, vi } from 'vitest'
import { basicAuthPlugin } from './basic-auth-plugin.js'

describe('basic-auth-plugin — without credentials configured', () => {
  it('logs at info level when no credentials are configured', async () => {
    const server = Hapi.server({ port: 0 })
    await server.register({ plugin: hapiPino, options: { enabled: false } })

    const infoSpy = vi.spyOn(server.logger, 'info')
    const warnSpy = vi.spyOn(server.logger, 'warn')

    await server.register({
      plugin: basicAuthPlugin.plugin,
      options: {
        config: getConfig({ basicAuth: { username: '', password: '' } })
      }
    })

    await server.stop()

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Basic Auth strategy registered without credentials'
      )
    )
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'Basic Auth strategy registered without credentials'
      )
    )
  })
})
