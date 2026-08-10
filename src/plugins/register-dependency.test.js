import Hapi from '@hapi/hapi'
import { describe, it, expect, vi } from 'vitest'
import { registerDependency } from './register-dependency.js'

/** @import { Request } from '@hapi/hapi' */
/** @import { ServerApp } from '#common/hapi-types.js' */

describe('registerDependency', () => {
  it('registers the dependency on server.app built with server.logger', () => {
    const server = Hapi.server()
    const dependency = { findById: vi.fn() }
    const getInstance = vi.fn().mockReturnValue(dependency)

    registerDependency(server, 'reportsRepository', getInstance)

    const app = /** @type {ServerApp} */ (server.app)
    expect(app.reportsRepository).toBe(dependency)
    expect(getInstance).toHaveBeenCalledWith({ logger: server.logger })
  })

  it('creates and caches a lazy per-request instance built with request.logger', async () => {
    const server = Hapi.server()
    const dependency = { findById: vi.fn() }
    const getInstance = vi.fn().mockReturnValue(dependency)

    registerDependency(server, 'reportsRepository', getInstance)

    /** @type {unknown[]} */
    const accesses = []
    /** @type {Request | undefined} */
    let handledRequest
    server.route({
      method: 'GET',
      path: '/',
      handler: (request, h) => {
        handledRequest = request
        const typed = /** @type {Request & { reportsRepository: unknown }} */ (
          request
        )
        // Access twice so both the compute-and-cache and cached-read paths run.
        accesses.push(typed.reportsRepository, typed.reportsRepository)
        return h.response('ok')
      }
    })

    await server.inject({ method: 'GET', url: '/' })

    expect(accesses[0]).toBe(dependency)
    expect(accesses[1]).toBe(accesses[0])
    // Built once for server.app and once lazily from the request itself.
    expect(getInstance).toHaveBeenCalledTimes(2)
    expect(getInstance).toHaveBeenLastCalledWith(handledRequest)
  })
})
