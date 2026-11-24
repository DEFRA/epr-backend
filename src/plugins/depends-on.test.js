import Hapi from '@hapi/hapi'
import { describe, expect, it, vi } from 'vitest'
import { dependsOn } from './depends-on.js'

describe('dependsOn', () => {
  it('runs after once when the server is initialised again', async () => {
    const after = vi.fn()
    const server = Hapi.server()
    await server.register([
      { name: 'reportsRepository', register: () => {} },
      {
        name: 'reportsConsumer',
        register: (registered) => {
          dependsOn(registered, ['reportsRepository'], after)
        }
      }
    ])

    await server.initialize()
    await server.stop()
    await server.initialize()

    expect(after).toHaveBeenCalledTimes(1)
  })
})
