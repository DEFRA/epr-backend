import { describe, it, expect, vi } from 'vitest'
import { registerRepository } from './register-repository.js'

describe('registerRepository', () => {
  const createMockServer = () => ({
    app: {},
    logger: { info: vi.fn(), error: vi.fn() },
    ext: vi.fn()
  })

  it('registers repository on server.app using server.logger', () => {
    const server = createMockServer()
    const mockRepository = { findById: vi.fn() }
    const getInstance = vi.fn().mockReturnValue(mockRepository)

    registerRepository(server, 'testRepository', getInstance)

    expect(server.app.testRepository).toBe(mockRepository)
    expect(getInstance).toHaveBeenCalledWith({ logger: server.logger })
  })

  it('registers onRequest extension for per-request instances', () => {
    const server = createMockServer()
    const getInstance = vi.fn().mockReturnValue({})

    registerRepository(server, 'testRepository', getInstance)

    expect(server.ext).toHaveBeenCalledWith('onRequest', expect.any(Function))
  })

  it('creates lazy per-request instance with request.logger', async () => {
    const server = createMockServer()
    const mockRepository = { findById: vi.fn() }
    const getInstance = vi.fn().mockReturnValue(mockRepository)

    registerRepository(server, 'testRepository', getInstance)

    // Get the onRequest handler
    const onRequestHandler = server.ext.mock.calls[0][1]

    // Simulate a request
    const mockRequest = { logger: { info: vi.fn() } }
    const mockH = { continue: Symbol('continue') }

    const result = onRequestHandler(mockRequest, mockH)

    expect(result).toBe(mockH.continue)

    // Access the repository to trigger lazy initialization
    const repo = mockRequest.testRepository

    expect(repo).toBe(mockRepository)
    expect(getInstance).toHaveBeenCalledWith(mockRequest)
  })

  it('caches per-request instance on subsequent accesses', async () => {
    const server = createMockServer()
    const getInstance = vi.fn().mockReturnValue({ id: 'repo' })

    registerRepository(server, 'testRepository', getInstance)

    const onRequestHandler = server.ext.mock.calls[0][1]
    const mockRequest = { logger: { info: vi.fn() } }
    const mockH = { continue: Symbol('continue') }

    onRequestHandler(mockRequest, mockH)

    // Access multiple times
    const first = mockRequest.testRepository
    const second = mockRequest.testRepository

    expect(first).toBe(second)
    // getInstance called twice: once for server.app, once for request
    expect(getInstance).toHaveBeenCalledTimes(2)
  })

  it('uses different instances for server.app and request', () => {
    const server = createMockServer()
    let callCount = 0
    const getInstance = vi.fn().mockImplementation(() => ({
      id: `instance-${++callCount}`
    }))

    registerRepository(server, 'testRepository', getInstance)

    const onRequestHandler = server.ext.mock.calls[0][1]
    const mockRequest = { logger: { info: vi.fn() } }
    const mockH = { continue: Symbol('continue') }

    onRequestHandler(mockRequest, mockH)

    // server.app gets first instance (with server.logger)
    expect(server.app.testRepository.id).toBe('instance-1')

    // request gets second instance (with request.logger)
    expect(mockRequest.testRepository.id).toBe('instance-2')
  })
})
